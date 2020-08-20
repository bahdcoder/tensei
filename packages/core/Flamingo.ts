import Path from 'path'
import BodyParser from 'body-parser'
import ExpressSession from 'express-session'
import AsyncHandler from 'express-async-handler'
import ClientController from './controllers/ClientController'
import AuthController from './controllers/auth/AuthController'
import Express, { Request, Application, NextFunction } from 'express'
import RunActionController from './controllers/actions/RunActionController'
import IndexResourceController from './controllers/resources/IndexResourceController'

import {
    text,
    Tool,
    Asset,
    resource,
    Resource,
    FlamingoConfig,
    ResourceManager,
    SupportedDatabases,
    DatabaseRepositoryInterface,
    belongsToMany,
} from '@flamingo/common'
import CreateResourceController from './controllers/resources/CreateResourceController'
import DeleteResourceController from './controllers/resources/DeleteResourceController'
import FindResourceController from './controllers/resources/FindResourceController'
import UpdateResourceController from './controllers/resources/UpdateResourceController'
import { SetupFunctions } from '@flamingo/common/build/tools/Tool'

class Flamingo {
    public app: Application = Express()
    public databaseClient: any = null
    public extensions: {
        [key: string]: any
    } = {}
    private toolsBooted: boolean = false
    private databaseBooted: boolean = false
    private registeredApplication: boolean = false
    private databaseRepository: DatabaseRepositoryInterface | null = null

    private config: FlamingoConfig = {
        resources: [],
        tools: [],
        resourcesMap: {},
        adminTable: 'administrators',
        dashboardPath: 'admin',
        apiPath: 'api',
        scripts: [
            {
                name: 'flamingo.js',
                path: Path.resolve(__dirname, 'client', 'index.js'),
            },
        ],
        styles: [
            {
                name: 'flamingo.css',
                path: Path.resolve(__dirname, 'client', 'index.css'),
            },
        ],
        env: {
            port: process.env.PORT || 1377,
            database: (process.env.DATABASE as SupportedDatabases) || 'sqlite',
            sessionSecret: process.env.SESSION_SECRET || 'test-session-secret',
            databaseUrl:
                process.env.DATABASE_URL || 'mysql://root@127.0.0.1/flmg',
        },
    }

    public async register() {
        if (this.registeredApplication) {
            return this
        }
        await this.callToolHook('setup')

        await this.callToolHook('beforeDatabaseSetup')
        await this.registerDatabase()
        await this.callToolHook('afterDatabaseSetup')

        // Please do not change this order. Super important so bugs are not introduced.
        await this.callToolHook('beforeMiddlewareSetup')
        this.registerMiddleware()
        this.registerAssetsRoutes()
        await this.callToolHook('afterMiddlewareSetup')

        await this.callToolHook('beforeCoreRoutesSetup')
        this.registerCoreRoutes()
        await this.callToolHook('afterCoreRoutesSetup')

        this.registeredApplication = true

        return this
    }

    public getToolArguments() {
        return {
            app: this.app,
            style: (name: Asset['name'], path: Asset['path']) => {
                this.config.styles = [
                    ...this.config.styles,
                    {
                        name,
                        path,
                    },
                ]
            },
            script: (name: Asset['name'], path: Asset['path']) => {
                this.config.scripts = [
                    ...this.config.scripts,
                    {
                        name,
                        path,
                    },
                ]
            },
            resources: this.config.resources,
        }
    }

    public async callToolHook(hook: SetupFunctions) {
        for (let index = 0; index < this.config.tools.length; index++) {
            const tool = this.config.tools[index]

            const extension = await tool.data[hook](this.getToolArguments())

            if (hook === 'setup') {
                this.extensions = {
                    ...this.extensions,
                    [tool.slug]: extension,
                }
            }
        }

        return this
    }

    public dashboardPath(dashboardPath: string) {
        this.setValue('dashboardPath', dashboardPath)

        return this
    }

    public async registerDatabase() {
        // if database === mysql | sqlite | pg, we'll use the @flamingo/knex package, with either mysql, pg or sqlite3 package
        // We'll require('@flamingo/knex') and require('sqlite3') for example. If not found, we'll install.
        const { Repository } = require('@flamingo/knex')

        const repository: DatabaseRepositoryInterface = new Repository(
            this.config.env
        )

        const client = await repository.setup(this.config)

        this.resources(repository.setResourceModels(this.config.resources))

        this.databaseClient = client
        this.databaseRepository = repository

        this.app.use(
            (
                request: Express.Request,
                response: Express.Response,
                next: Express.NextFunction
            ) => {
                request.db = repository

                next()
            }
        )

        this.databaseBooted = true

        return this
    }

    public apiPath(apiPath: string) {
        this.setValue('apiPath', apiPath)

        return this
    }

    public registerMiddleware() {
        this.app.use(BodyParser.json())

        this.app.use(
            (
                request: Express.Request,
                response: Express.Response,
                next: Express.NextFunction
            ) => {
                request.resources = this.config.resourcesMap
                request.administratorResource = this.administratorResource()
                request.resourceManager = new ResourceManager(
                    this.config.resources,
                    this.databaseRepository!
                )

                next()
            }
        )

        const Store = require('connect-session-knex')(ExpressSession)

        this.app.use(
            ExpressSession({
                secret: this.config.env.sessionSecret,
                store: new Store({
                    knex: this.databaseClient,
                }),
                resave: false,
                saveUninitialized: false,
            })
        )

        this.app.use(this.setAuthMiddleware)
    }

    private getApiPath = (path: string) => {
        return `/${this.config.apiPath}/${path}`
    }

    private authMiddleware = async (request: Express.Request, response: Express.Response, next: Express.NextFunction) => {
        if (! request.admin) {
            return response.status(401).json({
                message: 'Unauthenticated.'
            })
        }

        next()
    }

    private setAuthMiddleware = async (request: Express.Request, response: Express.Response, next: Express.NextFunction) => {
        if (! request.session?.user) {
            return next()
        }

        try {
            const AdminModel = request.resources['administrators'].Model()
    
            const admin = (await (new AdminModel({
                id: request.session?.user
            })).fetch({
                withRelated: ['administrator-roles.administrator-permissions']
            })).toJSON()

            if (! admin) {
                throw {
                    message: `Unauthenticated.`,
                    status: 401
                }
            }

            request.admin = {
                name: admin.name,
                email: admin.email,
                id: admin.id as number,
                roles: (admin['administrator-roles'] || []).map((role: any) => ({
                    id: role.id,
                    name: role.name,
                    slug: role.slug
                })),
                permissions: admin['administrator-roles'].reduce((acc: [], role: any) => [
                    ...acc,
                    ...(role['administrator-permissions'] || []).map((permission: any) => permission.slug)
                ], [])
            }

            next()
        } catch (errors) {
            throw {
                message: `Unauthenticated.`,
                status: 401
            }
        }
    }

    public registerCoreRoutes() {
        // The administration dashboard
        this.app.get(
            `/${this.config.dashboardPath}(/*)?`,
            this.asyncHandler(ClientController.index)
        )

        this.app.post(
            this.getApiPath('login'),
            this.authMiddleware,
            this.asyncHandler(AuthController.login)
        )
        this.app.post(
            this.getApiPath('register'),
            this.asyncHandler(AuthController.register)
        )

        this.app.post(
            this.getApiPath('logout'),
            this.asyncHandler(AuthController.logout)
        )

        this.app.get(
            this.getApiPath(`resources/:resource`),
            this.authMiddleware,
            this.asyncHandler(IndexResourceController.index)
        )

        this.app.get(
            this.getApiPath(`resources/:resource/:resourceId`),
            this.authMiddleware,
            this.asyncHandler(FindResourceController.show)
        )

        this.app.get(
            this.getApiPath(`resources/:resource/:resourceId/:relatedResource`),
            this.authMiddleware,
            this.asyncHandler(FindResourceController.showRelation)
        )

        this.app.put(
            this.getApiPath(`resources/:resource/:resourceId`),
            this.authMiddleware,
            this.asyncHandler(UpdateResourceController.update)
        )

        this.app.patch(
            this.getApiPath(`resources/:resource/:resourceId`),
            this.authMiddleware,
            this.asyncHandler(UpdateResourceController.update)
        )

        this.app.post(
            this.getApiPath(`resources/:resource`),
            this.authMiddleware,
            this.asyncHandler(CreateResourceController.store)
        )

        this.app.post(
            this.getApiPath(`resources/:resource/actions/:action`),
            this.authMiddleware,
            this.asyncHandler(RunActionController.run)
        )

        this.app.delete(
            this.getApiPath(`resources/:resource/:resourceId`),
            this.authMiddleware,
            this.asyncHandler(DeleteResourceController.destroy)
        )

        this.app.use(
            (
                error: any,
                request: Express.Request,
                response: Express.Response,
                next: Express.NextFunction
            ) => {
                if (Array.isArray(error)) {
                    return response.status(422).json({
                        message: 'Validation failed.',
                        errors: error,
                    })
                }

                if (error.status === 404) {
                    return response.status(404).json({
                        message: error.message,
                    })
                }

                console.error(error)

                response.status(500).json({
                    message: 'Internal server error.',
                    error,
                })
            }
        )
    }

    public registerAssetsRoutes() {
        this.app.use(
            (
                request: Express.Request,
                response: Express.Response,
                next: Express.NextFunction
            ) => {
                // Set the app config on express here. Should probably get its own function soon.
                request.appConfig = this.config
                request.scripts = this.config.scripts
                request.styles = this.config.styles

                next()
            }
        )

        this.config.scripts.concat(this.config.styles).forEach((asset) => {
            this.app.get(
                `/${asset.name}`,
                this.asyncHandler(
                    (request: Express.Request, response: Express.Response) =>
                        response.sendFile(asset.path)
                )
            )
        })

        if (process.env.NODE_ENV !== 'production') {
            this.app.get(
                `/index.css.map`,
                (request: Express.Request, response: Express.Response) =>
                    response.sendFile(
                        Path.resolve(__dirname, 'client', 'index.css.map')
                    )
            )

            this.app.get(
                `/index.js.map`,
                (request: Express.Request, response: Express.Response) =>
                    response.sendFile(
                        Path.resolve(__dirname, 'client', 'index.js.map')
                    )
            )
        }
    }

    public asyncHandler(handler: Express.Handler) {
        return AsyncHandler(handler)
    }

    private setValue(key: keyof FlamingoConfig, value: any) {
        this.config = {
            ...this.config,
            [key]: value,
        }

        return this
    }

    public resources(resources: Array<Resource>) {
        const updatedResources = [
            ...this.config.resources,
            this.administratorResource(),
            this.roleResource(),
            this.permissionResource(),
            ...resources,
        ]

        const uniqueResources = Array.from(
            new Set(updatedResources.map((resource) => resource.data.name))
        )
            .map((resourceName) =>
                updatedResources.find(
                    (resource) => resource.data.name === resourceName
                )
            )
            .filter(Boolean) as Array<Resource>

        this.setValue(
            'resources',
            uniqueResources
        )

        const resourcesMap: FlamingoConfig['resourcesMap'] = {}

        uniqueResources.forEach(resource => {
            resourcesMap[resource.data.slug] = resource
        })

        this.setValue('resourcesMap', resourcesMap)

        return this
    }

    private roleResource() {
        return resource('Administrator Role')
            .hideFromNavigation()
            .fields([
                text('Name').rules('required').unique(),
                text('Slug').rules('required').unique(),

                belongsToMany('Administrator'),
                belongsToMany('Administrator Permission'),
            ])
    }

    private permissionResource() {
        return resource('Administrator Permission')
            .hideFromNavigation()
            .fields([
                text('Name'),
                text('Slug').rules('required').unique(),
                belongsToMany('Administrator Role'),
            ])
    }

    private administratorResource() {
        const Bcrypt = require('bcryptjs')

        return resource('Administrator')
            .hideFromNavigation()
            .fields([
                text('Name'),
                text('Email').unique().searchable(),
                text('Password').hidden(),
                belongsToMany('Administrator Role'),
            ])
            .beforeCreate((payload) => ({
                ...payload,
                password: Bcrypt.hashSync(payload.password),
            }))
            .beforeUpdate((payload) => ({
                ...payload,
                password: Bcrypt.hashSync(payload.password),
            }))
    }

    public tools(tools: Tool[]) {
        this.config.tools = tools

        return this
    }
}

export const flamingo = (config = {}) => {
    return new Flamingo()
}

export default Flamingo

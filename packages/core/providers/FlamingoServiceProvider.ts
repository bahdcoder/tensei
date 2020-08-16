// import Fs from 'fs'
// import Path from 'path'
// import Dotenv from 'dotenv'
// import Express from 'express'
// import Mongodb from 'mongodb'
// import BodyParser from 'body-parser'
// import ConnectMongo from 'connect-mongo'
// import ExpressSession from 'express-session'
// import {
//     Config,
// } from '../typings/interfaces'
// import Resource from '../resources/Resource'
// import ClientController from '../controllers/ClientController'
// import LoginController from '../controllers/auth/LoginController'

// import DatabaseRepository from '../database/Repository'
// import SqlDatabaseRepository from '../database/SqlRepository'
// import FindResourceController from '../controllers/resources/FindResourceController'
// import IndexResourceController from '../controllers/resources/IndexResourceController'
// import CreateResourceController from '../controllers/resources/CreateResourceController'
// import UpdateResourceController from '../controllers/resources/UpdateResourceController'
// import DeleteResourceController from '../controllers/resources/DeleteResourceController'

// export class FlamingoServiceProvider {
//     public app: Express.Application = Express()

//     public client: Mongodb.MongoClient | null = null

//     public router: Express.Router = Express.Router()

//     public resources: Resource[] = []

//     public db: DatabaseRepository | null = null

//     public config: Config | null = null

//     /**
//      *
//      * Get the path to where the resources are saved.
//      *
//      * @param root this is the root of the project
//      */
//     public resourcesIn(root: string) {
//         return Path.resolve(root, 'resources')
//     }

//     public async register() {
//         this.registerEnvironmentVariables()

//         this.db = await this.establishDatabaseConnection()

//         const knexDb = new SqlDatabaseRepository()

//         await knexDb.performDatabaseSchemaSync(this.resources as any)

//         this.registerMiddleware()

//         await this.registerRoutes()
//     }

//     public registerEnvironmentVariables() {
//         // Dotenv.config({
//         //     path: Path.resolve(this.$root, '.env'),
//         // })

//         this.registerConfig()
//     }

//     public registerMiddleware() {
//         this.app.use(BodyParser.json())

//         const Store = ConnectMongo(ExpressSession)

//         this.app.use(
//             (
//                 request: Express.Request,
//                 response: Express.Response,
//                 next: Express.NextFunction
//             ) => {
//                 request.db = this.db
//                 request.resources = this.resources

//                 next()
//             }
//         )

//         this.app.use(
//             ExpressSession({
//                 secret: this.config?.sessionSecret!,
//                 store: new Store({
//                     client: this.client!,
//                 }),
//                 resave: false,
//                 saveUninitialized: false,
//             })
//         )
//     }

//     public async registerRoutes() {
//         this.registerAuthRoutes()

//         this.registerResourcesRoutes()

//         this.router.get('*', ClientController.index)

//         this.app.use(this.router)
//     }

//     public launchServer(serverCallback: (config: Config) => void) {
//         this.app.listen(this.config!.port, () => serverCallback(this.config!))
//     }

//     public registerResourcesRoutes() {
//         this.router.post(
//             `/api/resources/:resource`,
//             CreateResourceController.store
//         )

//         this.router.put(
//             `/api/resources/:resource/:resourceId`,
//             UpdateResourceController.update
//         )

//         this.router.get(
//             `/api/resources/:resource`,
//             IndexResourceController.index
//         )

//         this.router.get(
//             `/api/resources/:resource/:resourceId`,
//             FindResourceController.show
//         )

//         this.router.delete(
//             `/api/resources/:resource/:resourceId`,
//             DeleteResourceController.destroy
//         )
//     }

//     public registerAuthRoutes() {
//         this.router.post('/api/login', LoginController.store)

//         this.router.post('/api/logout', LoginController.logout)
//     }

//     public registerResources(resources: Resource[]) {
//         this.resources = resources

//         return this
//     }

//     public async establishDatabaseConnection() {
//         this.client = new Mongodb.MongoClient(
//             process.env.DATABASE_URI as string,
//             {
//                 useNewUrlParser: true,
//                 useUnifiedTopology: true,
//             }
//         )

//         await this.client.connect()

//         return new DatabaseRepository(this.client.db())
//     }

//     private registerConfig() {
//         this.config = {
//             port: process.env.PORT || 1377,
//             sessionSecret: process.env.SESSION_SECRET || 'test-session-secret',
//             databaseUri:
//                 process.env.DATABASE_URI || 'mongodb://localhost/flamingo',
//         }
//     }
// }

// export default FlamingoServiceProvider
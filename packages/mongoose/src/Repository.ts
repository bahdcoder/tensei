import { sentenceCase } from 'change-case'
import Mongoose, {
    Connection,
    ConnectionOptions,
    Model,
    Mongoose as MongooseType,
    FilterQuery
} from 'mongoose'
import {
    DatabaseRepositoryInterface,
    ResourceHelpers,
    Config,
    resource,
    text,
    hasMany,
    ResourceContract,
    DataPayload,
    FetchAllRequestQuery
} from '@tensei/common'
import { dateTime } from '@tensei/common'
import { belongsToMany } from '@tensei/common'

export class Repository extends ResourceHelpers
    implements DatabaseRepositoryInterface<any> {
    private $db: Mongoose.Connection | null = null

    private connectionString: string = ''

    private config: ConnectionOptions = {}

    private mongooseModels: Model<any>[] = []

    public async setup(config: Config) {
        this.config = config.databaseConfig[1]
        this.connectionString = config.databaseConfig[0]

        config.pushResource(this.administratorResource())
        config.pushResource(this.roleResource())
        config.pushResource(this.passwordResetsResource())
        config.pushResource(this.permissionResource())

        // Mongoose.set('debug', true)

        this.resources = config.resources

        try {
            this.bootMongooseModels()

            await this.establishDatabaseConnection()

            await this.setupRolesAndPermissions()
        } catch (errors) {
            // TODO: Log these errors with this.logger
            console.error('*************', errors)
            process.exit(1)
        }

        return this.$db
    }

    public setResourceModels = (resources: ResourceContract[]) =>
        resources.map((resource, index) => {
            resource.Model = () => this.mongooseModels[index]

            return resource
        })

    private getResourceMongooseModel = (
        resource: ResourceContract = this.getCurrentResource()
    ) =>
        this.mongooseModels.find(
            // @ts-ignore
            Model => resource.data.name === Model.getTenseiResourceName()
        )

    private bootMongooseModels() {
        Mongoose.set('useCreateIndex', true)

        this.mongooseModels = this.resources.map(resource => {
            const schemaDefinition: Mongoose.SchemaDefinition = {}

            resource.data.fields.forEach(field => {
                const serializedField = field.serialize()

                let defaultValue: any = ''
                let type: any = Mongoose.Schema.Types.String

                if (field.databaseFieldType === 'increments') {
                    return
                }

                if (
                    ['string', 'text', 'enu', 'json'].includes(field.databaseFieldType)
                ) {
                    type = Mongoose.Schema.Types.String
                }

                if (
                    ['datetime', 'date', 'timestamp'].includes(
                        field.databaseFieldType
                    )
                ) {
                    type = Mongoose.Schema.Types.Date

                    if (field.serialize().defaultToNow) {
                        defaultValue = new Date()
                    }
                }

                if (['boolean'].includes(field.databaseFieldType)) {
                    type = Mongoose.Schema.Types.Boolean
                }

                if (
                    ['integer', 'bigInteger'].includes(field.databaseFieldType)
                ) {
                    type = Mongoose.Schema.Types.Number
                }

                if (['array'].includes(field.databaseFieldType)) {
                    type = [String]

                    defaultValue = []
                }

                if (
                    ['BelongsToField'].includes(field.component)
                ) {
                    const relatedResource = this.resources.find(r => r.data.name === field.name)!

                    schemaDefinition[relatedResource.data.camelCaseName] = {
                        type: Mongoose.Schema.Types.ObjectId,
                        ref: relatedResource.data.pascalCaseName
                    }

                    defaultValue = null
                }

                if (
                    ['HasManyField', 'BelongsToManyField'].includes(field.component)
                ) {
                    const relatedResource = this.resources.find(r => r.data.name === field.name)!

                    schemaDefinition[relatedResource.data.camelCaseNamePlural] = [{
                        type: Mongoose.Schema.Types.ObjectId,
                        ref: relatedResource.data.pascalCaseName
                    }]

                    defaultValue = []
                }


                if (!['HasManyField', 'BelongsToField', 'BelongsToManyField'].includes(field.component)) {
                    schemaDefinition[field.databaseField] = {
                        type,
                        unique: field.isUnique,
                        index: field.isUnique || field.isSearchable,
                        default: serializedField.defaultValue || defaultValue
                    }
                }

                if (['enu'].includes(field.databaseFieldType)) {
                    schemaDefinition[field.databaseField] = {
                        ...schemaDefinition[field.databaseField],
                        enum: (serializedField.selectOptions || []).map(
                            option => option.value
                        )
                    }
                }
            })

            const schema = new Mongoose.Schema(schemaDefinition)

            schema.statics.getTenseiResourceName = () => resource.data.name

            return Mongoose.model(resource.data.pascalCaseName, schema, resource.data.table)
        })
    }

    private roleResource() {
        return resource('Administrator Role')
            .hideFromNavigation()
            .fields([
                text('Name')
                    .rules('required')
                    .unique(),
                text('Slug')
                    .rules('required')
                    .unique(),
                hasMany('Administrator Permission')
            ])
    }

    private permissionResource() {
        return resource('Administrator Permission')
            .hideFromNavigation()
            .fields([
                text('Name')
                    .rules('required')
                    .unique(),
                text('Slug')
                    .rules('required')
                    .unique(),
            ])
    }

    private passwordResetsResource() {
        return resource('Administrator Password Reset')
            .hideFromNavigation()
            .fields([
                text('Email')
                    .searchable()
                    .unique()
                    .notNullable(),
                text('Token')
                    .unique()
                    .notNullable(),
                dateTime('Expires At')
            ])
    }

    private getDefaultQuery = (baseQuery: FetchAllRequestQuery) => {
        return {
            ...baseQuery,
            fields: baseQuery.fields,
            page: baseQuery.page || 1,
            search: baseQuery.search || '',
            perPage: baseQuery.perPage || baseQuery.per_page || 10
        }
    }

    private administratorResource() {
        const Bcrypt = require('bcryptjs')

        return resource('Administrator')
            .hideFromNavigation()
            .fields([
                text('Name'),
                text('Email')
                    .unique()
                    .searchable()
                    .rules('required', 'email'),
                text('Password')
                    .hidden()
                    .rules('required', 'min:8'),
                belongsToMany('Administrator Role')
            ])
            .beforeCreate(payload => ({
                ...payload,
                password: Bcrypt.hashSync(payload.password)
            }))
            .beforeUpdate(payload => ({
                ...payload,
                password: Bcrypt.hashSync(payload.password)
            }))
    }

    private setupRolesAndPermissions = async () => {
        const permissions: string[] = []

        this.resources.forEach(resource => {
            ;['create', 'read', 'update', 'delete'].forEach(operation => {
                permissions.push(`${operation}:${resource.data.slug}`)
            })

            resource.data.actions.forEach(action => {
                permissions.push(
                    `run:${resource.data.slug}:${action.data.slug}`
                )
            })
        })

        const roleResource = this.findResource(this.roleResource().data.name)
        const permissionResource = this.findResource(this.permissionResource().data.name)

        if (!roleResource) {
            throw {
                message: 'Role and Permission resources must be defined.',
                status: 500
            }
        }

        const RoleModel = this.getResourceMongooseModel(roleResource)
        const PermissionModel = this.getResourceMongooseModel(permissionResource)

        if (!RoleModel || !PermissionModel) {
            throw {
                message: 'Role and Permission models must be defined.',
                status: 500
            }
        }

        let superAdminRole = await RoleModel.findOne({
            slug: 'super-admin'
        })

        // find all existing permissions
        const existingPermissions = (
            await PermissionModel.find({
                slug: {
                    $in: permissions
                }
            })
        ).map((permission: any) => permission.slug)

        const newPermissionsToCreate = permissions.filter(
            permission => !existingPermissions.includes(permission)
        )

        const insertValues = newPermissionsToCreate.map(permission => ({
            name: sentenceCase(permission.split(':').join(' ')),
            slug: permission
        }))

        if (insertValues.length > 0) {
            await PermissionModel.insertMany(
                newPermissionsToCreate.map(permission => ({
                    name: sentenceCase(permission.split(':').join(' ')),
                    slug: permission
                }))
            )
        }

        const allPermissions = (await PermissionModel.find()).map(permission => permission._id)

        if (!superAdminRole) {
            superAdminRole = await RoleModel.create({
                name: 'Super Admin',
                slug: 'super-admin',
                administratorPermissions: allPermissions
            })
        } else {
            await RoleModel.updateOne(
                {
                    _id: superAdminRole._id
                },
                {
                    administratorPermissions: allPermissions
                }
            )
        }
    }

    async establishDatabaseConnection() {
        await Mongoose.connect(this.connectionString, this.config)

        this.$db = Mongoose.connection
    }

    async aggregateCount(between: [string, string]) {
        return 0
    }

    async aggregateAvg(between: [string, string], columns: string[]) {
        return 0
    }

    async aggregateMin(between: [string, string], columns: string[]) {
        return 0
    }

    async aggregateMax(between: [string, string], columns: string[]) {
        return 0
    }

    async create(payload: DataPayload, relationshipPayload: DataPayload = {}) {
        const resource = this.getCurrentResource()
        const Model = this.getResourceMongooseModel()!

        this.getCurrentResource().data.fields.forEach(field => {
            if (field.serialize().isRelationshipField) { }
        })

        const result = await Model.create({
            ...payload,
            ...relationshipPayload
        })

        return this.serializeResponse(
            result.toObject()
        )
    }

    async update(
        id: number | string,
        payload: DataPayload,
        relationshipPayload: DataPayload,
    ) {
        const Model = this.getResourceMongooseModel()!

        const result = await Model.updateOne({
            _id: id
        }, {
            ...payload,
            ...relationshipPayload
        })

        return this.serializeResponse(
            result.toObject()
        )
    }

    async findAll(baseQuery: FetchAllRequestQuery) {
        const query = this.getDefaultQuery(baseQuery)
        const [countResolver, dataResolver]: any = this.findAllResolvers(query)

        const total = await countResolver()

        const results = await dataResolver()

        return {
            page: query.page,
            total: parseInt(total),
            perPage: query.perPage,
            data: this.serializeResponse(results),
            pageCount: Math.ceil(total / query.perPage)
        }
    }

    async findAllData(query: FetchAllRequestQuery) {
        const [, dataResolver] = this.findAllResolvers(query)

        return this.serializeResponse(
            await dataResolver()
        )
    }

    findAllResolvers(baseQuery: FetchAllRequestQuery) {
        const Model = this.getResourceMongooseModel()!

        const query = this.getDefaultQuery(baseQuery)

        const getQuery = () => {
            let builder = Model.find(
                this.handleFilterQueries(query.filters)
            )

            if (query.fields) {
                builder = builder.select(query.fields)
            }

            return builder
        }

        return [
            () => getQuery().countDocuments(),
            () => getQuery().limit(query.perPage).skip((query.page - 1) * query.perPage)
        ]
    }

    async findAllByIds(ids: number[], fields?: string[]) {
        const Model = this.getResourceMongooseModel()!

        return this.serializeResponse(
            await Model.find({
                _id: {
                    $in: ids
                }
            }).select(fields)
        )
    }

    async findAllBelongingToManyData(
        relatedResource: ResourceContract,
        resourceId: number | string,
        query: FetchAllRequestQuery
    ) {
        const [, dataResolver] = await this.findAllBelongingToManyResolvers(relatedResource, resourceId, query)

        return this.serializeResponse(
            await dataResolver()
        )
    }

    async findAllBelongingToManyCount(
        relatedResource: ResourceContract,
        resourceId: number | string,
        query: FetchAllRequestQuery
    ) {
        const [countResolver] = await this.findAllBelongingToManyResolvers(relatedResource, resourceId, query)

        return countResolver()
    }

    async findAllBelongingToManyResolvers(
        relatedResource: ResourceContract,
        resourceId: number | string,
        baseQuery: FetchAllRequestQuery
    ) {
        const resource = this.getCurrentResource()

        const query = this.getDefaultQuery(baseQuery)
        const RelatedModel = this.getResourceMongooseModel(relatedResource)!

        const getQuery = () => {
            let modelQuery: FilterQuery<any> = {}

            if (query.search) {
                modelQuery = this.populateSearchQueries(query.search, relatedResource, modelQuery)
            }

            return RelatedModel.find({
                [resource.data.camelCaseNamePlural]: {
                    $in: [resourceId]
                },
                ...modelQuery,
                ...this.handleFilterQueries(query.filters)
            })
        }

        const countResolver = () => getQuery().countDocuments()

        const dataResolver = () => getQuery().skip(
            query.perPage * (query.page - 1)
        ).limit(query.page)

        return [countResolver, dataResolver]
    }

    public handleFilterQueries(filters: FetchAllRequestQuery['filters']) {
        let findQuery: DataPayload = {}

        filters?.forEach(filter => {
            if (filter.operator === 'in') {
                findQuery[filter.field] = {
                    ...findQuery[filter.field],
                    $in: Array.isArray(filter.value) ? filter.value : [filter.value]
                }
            }

            if (filter.operator === 'not_in') {
                findQuery[filter.field] = {
                    ...findQuery[filter.field],
                    $nin: Array.isArray(filter.value) ? filter.value : [filter.value]
                }
            }

            if (filter.operator === 'matches') {
                findQuery[filter.field] = {
                    ...findQuery[filter.field],
                    $regex: new RegExp(filter.value)
                }
            }

            if (filter.operator === 'equals') {
                findQuery[filter.field] = filter.value
            }

            if (filter.operator === 'contains') {
                findQuery[filter.field] = {
                    ...findQuery[filter.field],
                    $regex: new RegExp(`.*${filter.value}.*`)
                }
            }

            if (filter.operator === 'gte') {
                findQuery[filter.field] = {
                    ...findQuery[filter.field],
                    $gte: filter.value
                }
            }

            if (filter.operator === 'gt') {
                findQuery[filter.field] = {
                    ...findQuery[filter.field],
                    $gt: filter.value
                }
            }

            if (filter.operator === 'lte') {
                findQuery[filter.field] = {
                    ...findQuery[filter.field],
                    $lte: filter.value
                }
            }

            if (filter.operator === 'lt') {
                findQuery[filter.field] = {
                    ...findQuery[filter.field],
                    $lt: filter.value
                }
            }

            if (filter.operator === 'is_null') {
                findQuery[filter.field] = null
            }

            if (filter.operator === 'not_null') {
                findQuery[filter.field] = {
                    ...findQuery[filter.field],
                    $ne: null
                }
            }
        })

        return findQuery
    }

    public async getAdministratorById(id: string | number) {
        this.setResource(this.administratorResource())

        const admin = await this.findOneById(id, [], ['administratorRoles.administratorPermissions'])

        if (!admin) {
            throw {
                message: `Could not find administrator with _id ${id}`,
                status: 404
            }
        }

        const permissions = admin.administratorRoles.reduce(
            (acc: [], role: any) => [
                ...acc,
                ...(role.administratorPermissions || []).map(
                    (permission: any) => permission.slug
                )
            ],
            []
        )

        return this.serializeResponse({
            ...admin,
            permissions
        })
    }

    public async createAdministrator(payload: DataPayload) {
        this.setResource(this.roleResource())

        const superAdmin = await this.findOneByField(
            'slug',
            'super-admin'
        )

        if (!superAdmin) {
            throw {
                message: `The super-admin role must be setup before creating an administrator user.`,
                status: 422
            }
        }

        this.setResource(this.administratorResource())

        const administrator = await this.create({
            ...payload,
            administratorRoles: [superAdmin._id]
        })

        return this.serializeResponse(administrator)
    }

    async findAllBelongingToMany(
        relatedResource: ResourceContract,
        resourceId: number | string,
        baseQuery: FetchAllRequestQuery
    ) {
        const query = this.getDefaultQuery(baseQuery)

        const [
            countResolver,
            dataResolver
        ]: any = await this.findAllBelongingToManyResolvers(
            relatedResource,
            resourceId,
            query
        )

        const data = await dataResolver()
        const count = await countResolver()

        return {
            data,
            page: query.page,
            perPage: query.perPage,
            total: count as number,
            pageCount: Math.ceil((count as number) / (query.perPage || 10))
        }
    }

    async findAllHasMany(
        relatedResource: ResourceContract,
        resourceId: string | number,
        baseQuery: FetchAllRequestQuery
    ) {
        const query = this.getDefaultQuery(baseQuery)

        const [countResolver, dataResolver] = await this.findAllHasManyResolvers(
            relatedResource,
            resourceId,
            query
        )

        const data = await dataResolver()
        const count = await countResolver()

        return {
            data,
            page: query.page,
            perPage: query.perPage,
            total: count as number,
            pageCount: Math.ceil((count as number) / (query.perPage || 10))
        }
    }

    async findAllHasManyData(
        relatedResource: ResourceContract,
        resourceId: string | number,
        baseQuery: FetchAllRequestQuery
    ) {
        const [, dataResolver] = await this.findAllHasManyResolvers(
            relatedResource,
            resourceId,
            baseQuery
        )

        return dataResolver()
    }

    async findAllHasManyCount(
        relatedResource: ResourceContract,
        resourceId: string | number,
        baseQuery: FetchAllRequestQuery
    ) {
        const [countResolver] = await this.findAllHasManyResolvers(
            relatedResource,
            resourceId,
            baseQuery
        )

        return countResolver()
    }

    populateSearchQueries(search: string, resource: ResourceContract, modelQuery: FilterQuery<any>) {
        const searchableFields = resource.data.fields.filter(
            field => field.isSearchable
        )

        modelQuery.$or = modelQuery.$or || []

        searchableFields.forEach(field => {
            modelQuery.$or!.push({
                [field.databaseField]: {
                    $regex: new RegExp(search)
                }
            })
        })

        return modelQuery
    }

    async findAllHasManyResolvers(
        relatedResource: ResourceContract,
        resourceId: string | number,
        baseQuery: FetchAllRequestQuery
    ) {
        const resource = this.getCurrentResource()

        const query = this.getDefaultQuery(baseQuery)
        const Model = this.getResourceMongooseModel(resource)!
        const RelatedModel = this.getResourceMongooseModel(relatedResource)!

        const resourceInstance = await Model.findById(resourceId)

        if (!resourceInstance) throw {
            status: 404,
            message: `Cannot find a ${resource.data.name} with _id of ${resourceId}`
        }

        const getQuery = () => {
            let modelQuery: FilterQuery<any> = {}

            if (query.search) {
                modelQuery = this.populateSearchQueries(query.search, relatedResource, modelQuery)
            }

            return RelatedModel.find({
                _id: {
                    $in: this.serializeResponse(resourceInstance)[relatedResource.data.camelCaseNamePlural]
                },
                ...modelQuery,
                ...this.handleFilterQueries(query.filters)
            })
        }

        return [
            () => getQuery().countDocuments(),
            async () => {
                return this.serializeResponse(
                    await getQuery().limit(query.perPage).skip((query.page - 1) * query.perPage)
                )
            }
        ]
    }

    parseRelationshipsToPopulate(relationship: string) {
        if (!relationship.includes('.')) {
            return relationship
        }

        let populateQuery: any = {}

        const arrayOfPopulates = relationship.split('.')

        // TODO: Refactor to dynamic.

        arrayOfPopulates.forEach((populate, index) => {
            if (index === 0) {
                populateQuery = {
                    path: arrayOfPopulates[0]
                }
            }

            if (index === 1) {
                populateQuery = {
                    path: arrayOfPopulates[0],
                    populate: {
                        path: arrayOfPopulates[1]
                    }
                }
            }

            if (index === 2) {
                populateQuery = {
                    path: arrayOfPopulates[0],
                    populate: {
                        path: arrayOfPopulates[1],
                        populate: {
                            path: arrayOfPopulates[2]
                        }
                    }
                }
            }
        })

        return populateQuery
    }

    async findOneById(
        id: number | string,
        fields?: string[],
        withRelationships?: string[]
    ) {
        const Model = this.getResourceMongooseModel()!

        let Query = Model.findById(id).select(fields || [])

        if (withRelationships && withRelationships.length > 0) {
            withRelationships.forEach((relationship) => {
                Query = Query.populate(
                    this.parseRelationshipsToPopulate(relationship)
                )
            })
        }

        const model = await Query.exec()

        if (!model) {
            return model
        }

        return this.serializeResponse(model.toObject())
    }

    async findOneByField(field: string, value: string, fields?: string[]) {
        const Model = this.getResourceMongooseModel()!

        const model = await Model.findOne({
            [field]: value
        }).select(fields)

        if (!model) {
            return model
        }

        return this.serializeResponse(model.toObject())
    }

    async findOneByFieldExcludingOne(
        field: string,
        value: string,
        excludeId: string | number,
        fields?: string[]
    ) {
        const Model = this.getResourceMongooseModel()!

        return this.serializeResponse(
            await Model.findOne({
                [field]: value,
                _id: {
                    $ne: excludeId
                }
            }).select(fields)
        )
    }

    updateManyByIds(ids: number[], valuesToUpdate: {}) {
        return Promise.resolve(1)
    }

    updateOneByField(field: string, value: any, payload: DataPayload = {}) {
        return Promise.resolve(null)
    }

    async deleteById(id: number | string) {
        const Model = this.getResourceMongooseModel()!

        return Model.deleteOne({
            _id: id
        })
    }

    async findAllCount(query?: FetchAllRequestQuery) {
        const [countResolver] = this.findAllResolvers(query || {})

        return countResolver() as any
    }

    private serializeResponse(response: any) {
        if (!response) return response

        if (Array.isArray(response)) {
            return response.map(r => ({
                ...(r.toObject ? r.toObject() : r),
                id: r._id
            }))
        }

        return {
            ...(response.toObject ? response.toObject() : response),
            id: response._id
        }
    }
}

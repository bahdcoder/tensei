const {
    dateTime,
    integer,
    text,
    date,
    belongsTo,
    select,
    resource,
    action,
    textarea,
    belongsToMany,
} = require('@flamingo/core')
const { trix } = require('@flamingo/trix')

module.exports = resource('Post')
    .displayInNavigation()
    .actions([
        action('Publish on')
            .positive()
            .handle(async ({ request, models, payload, notification }) => notification({
                message: 'All articles have been published.',
                variant: 'positive',
                position: 'top',
            }))
            .fields([
                dateTime('Publish date').rules('required'),
                textarea('Reason for publishing')
                    .default('A short description of why you published.')
                    .rules('required', 'max:50'),
                trix('Post content').rules('required', 'min:12'),
            ])
            .showOnTableRow(),
        action('Archive')
            .handle(async ({ request, models, payoad, html }) => html(
                `
                <div className='w-full bg-gray-100'>
                    <p>SOME EXAMPLE HTML TO BE SET ON THE DOM</p>
                </div>
            `,
                201
            ))
            .hideFromIndex()
            .confirmButtonText('Archive posts'),
    ])
    .fields([
        text('Title')
            .sortable()
            .searchable()
            .unique()
            .rules('required', 'max:24'),
        text('Description').rules('required').hideFromIndex(),
        trix('Content').rules('required', 'max:2000', 'min:12').hideFromIndex(),
        integer('Av. CPC').rules('required').hideFromDetail(),
        select('Category')
            .options([
                {
                    label: 'Javascript',
                    value: 'javascript',
                },
                {
                    label: 'Angular',
                    value: 'angular',
                },
                {
                    label: 'Mysql',
                    value: 'mysql',
                },
                {
                    label: 'Postgresql',
                    value: 'pg',
                },
            ])
            .rules('required')
            .searchable(),
        belongsTo('User').searchable().rules('required'),
        date('Published At')
            .notNullable()
            .firstDayOfWeek(4)
            .rules('required', 'date')
            .format('do MMM yyyy, hh:mm a'),
        dateTime('Scheduled For')
            .rules('required', 'date')
            .format('do MMM yyyy, hh:mm a')
            .hideFromIndex(),
        belongsToMany('Tag'),
    ])
    .perPageOptions([25, 50, 100])
    .displayField('title')

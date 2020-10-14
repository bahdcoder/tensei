const { text, textarea, belongsTo, resource, file } = require('@tensei/core')

module.exports = resource('Comment').fields([
    text('Title').rules('required').searchable(),
    textarea('Body').rules('required').hideOnIndex(),
    file('Avatar')
        .rules('required')
        .maxSize(200)
        .allowedMimeTypes(['application/pdf']),
    belongsTo('Post'),
])

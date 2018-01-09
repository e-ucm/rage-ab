'use strict';

module.exports = (function () {
    var Collection = require('easy-collections');
    var db = require('./db');
    var utils = require('./utils');
    var groupings = new Collection(db, 'groupings');
    var classes = new Collection(db, 'classes');
    var activities = new Collection(db, 'activities');

    var Validator = require('jsonschema').Validator;
    var v = new Validator();

    var groupingSchema = {
        id: '/GroupingSchema',
        type: 'object',
        properties: {
            name: { type: 'string'},
            classId: { type: 'string'},
            teachers: {
                type: 'array',
                items: {type: 'string'}
            },
            groups: {
                type: 'array',
                items: {type: 'string'}
            }
        },
        required: ['name', 'classId', 'teachers', 'groups'],
        additionalProperties: false
    };
    var participantsGroupingSchema = {
        id: '/ParticipantsGroupingSchema',
        type: 'object',
        properties: {
            name: { type: 'string'},
            classId: { type: 'string'},
            teachers: {
                type: 'array',
                items: {type: 'string'}
            },
            groups: {
                type: 'array',
                items: {type: 'string'}
            }
        },
        additionalProperties: false,
        minProperties: 1
    };
    v.addSchema(groupingSchema, '/GroupingSchema');
    v.addSchema(participantsGroupingSchema, '/ParticipantsGroupingSchema');

    groupings.sort = {
        _id: -1
    };

    /**
     * Returns the groups
     */
    groupings.getGroupings = function (classId) {
        return groupings.find({classId: groupings.toObjectID(classId)});
    };

    /**
     * Creates a new group.
     * @Returns a promise with the group created
     */
    groupings.createGroupings = function (username, classId, grouping) {
        if(!grouping.teachers){
            grouping.teachers = [];
        }
        
        if (grouping.teachers.indexOf(username) < 0) {
            grouping.teachers.push(username);
        }
        grouping.classId = classId;
        var validationObj = v.validate(grouping, groupingSchema);
        if (validationObj.errors && validationObj.errors.length > 0) {
            throw {
                message: 'Course bad format: ' + validationObj.errors[0],
                status: 400
            };
        } else {
            return groupings.insert(grouping);
        }
    };

    groupings.modifyGroupings = function (id, username, body, add) {
        var validationObj = v.validate(body, groupingSchema);
        validationObj = validationObj.errors.length > 0 ? v.validate(body, participantsGroupingSchema): validationObj;
        if (validationObj.errors && validationObj.errors.length > 0) {
            throw {
                message: 'Course bad format: ' + validationObj.errors[0],
                status: 400
            };
        } else {
            return groupings.find(groupings.toObjectID(id), true)
                .then(function (grouping) {
                    if (!grouping) {
                        throw {
                            message: 'Group does not exist',
                            status: 400
                        };
                    }

                    if (!grouping.teachers || grouping.teachers.indexOf(username) === -1) {
                        throw {
                            message: 'You don\'t have permission to modify this group.',
                            status: 401
                        };
                    }

                    if (body._id) {
                        delete body._id;
                    }

                    var update = {};
                    utils.addToArrayHandler(update, body, 'teachers', add);
                    utils.addToArrayHandler(update, body, 'groups', add);

                    if (add && body.name) {
                        update.$set = {};
                        update.$set.name = body.name;
                    }

                    return groupings.findAndUpdate(id, update);
                });
        }
    };

    groupings.removeGroupings = function (id, username) {
        return groupings.findById(id)
            .then(function (groupingRes) {
                if (!groupingRes) {
                    throw {
                        message: 'Course does not exist',
                        status: 404
                    };
                }

                if (!groupingRes.teachers || groupingRes.teachers.indexOf(username) === -1) {
                    throw {
                        message: 'You don\'t have permission to delete this class.',
                        status: 401
                    };
                }

                return classes.findById(groupingRes.classId).then(function (classObj) {
                    if (classObj.groupings && classObj.groupings.length > 0) {
                        var updateGroupings = {};
                        utils.addToArrayHandler(updateGroupings, {groupings: [id]}, 'groupings', false);
                        classes.findAndUpdate(classObj._id, updateGroupings);
                    }

                    return activities.find({classId: groupingRes.classId})
                        .then(function (activitiesRes) {
                            if (activitiesRes.length > 0) {
                                activitiesRes.forEach(function(activityObj) {
                                    var updateGroupings = {};
                                    utils.addToArrayHandler(updateGroupings, {groupings: [id]}, 'groupings', false);

                                    activities.findAndUpdate(activityObj._id, updateGroupings);
                                });
                            }

                            return groupings.removeById(id).then(function (result, err) {
                                if (!err) {
                                    return {
                                        message: 'Success.'
                                    };
                                }
                            });
                        });
                });
            });
    };

    return groupings;
})();
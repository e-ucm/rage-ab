'use strict';

module.exports = (function () {
    var Q = require('q');
    var request = require('request');
    var kibana = {};

    // jscs:disable requireCamelCaseOrUpperCaseIdentifiers

    var defaultObject = {
        out: {
            name: '',
            gameplayId: '',
            type_hashCode: 0,
            score: 0,
            response: '',
            type: '',
            event_hashcode: 0,
            target: '',
            versionId: '',
            success: false,
            gameplayId_hashCode: 0,
            event: '',
            timestamp: '2000-01-19T11:05:27.772Z',
            target_hashCode: 0,
            stored: '2000-01-19T11:05:27.772Z',
            progress: 0,
            time: 0,
            ext: {
                progress: 0,
                time: 0,
                location: {
                    lat: 0,
                    lon: 0
                }
            }
        }
    };

    // jscs:enable requireCamelCaseOrUpperCaseIdentifiers

    /**
     * Creates a new analysis for the given versionId.
     * @Returns a promise with the analysis created
     */
    kibana.getVisualizations = function (user, gameId, esClient) {
        var deferred = Q.defer();

        esClient.search({
            index: '.games' + gameId,
            type: 'list',
            q: '_id:' + gameId
        }, function (error, response) {
            if (!error) {
                if (response.hits.hits[0]) {
                    if (user === 'dev') {
                        deferred.resolve(response.hits.hits[0]._source.visualizationsDev ? response.hits.hits[0]._source.visualizationsDev : []);
                    } else if ('tch') {
                        deferred.resolve(response.hits.hits[0]._source.visualizationsTch ? response.hits.hits[0]._source.visualizationsTch : []);
                    } else if ('all') {
                        var c = response.hits.hits[0]._source.visualizationsTch.concat(
                            response.hits.hits[0]._source.visualizationsDev.filter(function (item) {
                                return response.hits.hits[0]._source.visualizationsTch.indexOf(item) < 0;
                            }));
                        deferred.resolve(c);
                    }
                } else {
                    deferred.resolve([]);
                }
            } else {
                deferred.reject(error);
            }
        });

        return deferred.promise;
    };

    kibana.getIndexTemplate = function(indexTemplateId, esClient) {
        var deferred = Q.defer();

        esClient.search({
            index: '.template',
            q: '_id:' + indexTemplateId
        }, function (error, response) {
            if (response.hits.hits[0]) {
                deferred.resolve(response.hits.hits[0]._source);
            } else {
                deferred.reject(new Error('Template not found', 404));
            }
        });

        return deferred.promise;
    };

    kibana.createIndexWithTemplate = function(indexName, indexTemplate, esClient) {
        var deferred = Q.defer();

        indexTemplate.title = indexName;
        console.log('kibana.createIndexWithTemplate -> Started, id: ' + indexName);

        esClient.index({
            index: '.kibana',
            type: 'index-pattern',
            id: indexName,
            body: indexTemplate
        }, function (error, response) {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve(response);
            }
        });

        return deferred.promise;
    };


    kibana.createRequiredIndexes = function(indexName, indexTemplateId, user, config, esClient) {
        var deferred = Q.defer();

        kibana.addIndexObject(indexName, esClient)
            .then(function() {
                kibana.getIndexTemplate(indexTemplateId, esClient)
                    .then(function(indexTemplate) {
                        kibana.createIndexWithTemplate(indexName, indexTemplate, esClient)
                            .then(function() { return kibana.createIndexWithTemplate('thomaskilmann-' + indexName, indexTemplate, esClient); })
                            .then(function() { return kibana.buildKibanaResources(indexName, config, esClient); })
                            .then(function(kibanaResources) {
                                return kibana.updateActivityPermissions(indexName, kibanaResources, config, user);
                            })
                            .then(function() {
                                deferred.resolve();
                            })
                            .catch(function(err) {
                                deferred.reject(err);
                            });
                    })
                    .fail(function(error) {
                        deferred.reject(error);
                    });
            })
            .fail(function(error) {
                deferred.reject(error);
            });

        return deferred.promise;
    };

    kibana.cloneVisualizationForActivity = function(gameId, visualizationId, activityId, esClient) {
        var deferred = Q.defer();

        esClient.search({
            index: '.games' + gameId,
            q: '_id:' + visualizationId
        }, function (error, response) {
            if (!error) {
                if (response.hits.hits[0] && response.hits.hits[0]._source.kibanaSavedObjectMeta) {
                    var re = /"index":"(\w+-)?(\w+.?\w+)"/;
                    var obj = response.hits.hits[0]._source;
                    // Replace template and save it
                    var m = re.exec(obj.kibanaSavedObjectMeta.searchSourceJSON);

                    if (m && m.length > 1) {
                        obj.kibanaSavedObjectMeta.searchSourceJSON = obj.kibanaSavedObjectMeta.searchSourceJSON.replace(m[2], activityId);
                    }

                    esClient.index({
                        index: '.kibana',
                        type: 'visualization',
                        id: response.hits.hits[0]._id + '_' + activityId,
                        body: obj
                    }, function (error, result) {
                        if (!error) {
                            deferred.resolve(result);
                        } else {
                            deferred.reject(error);
                        }
                    });
                } else {
                    deferred.reject(new Error('Template not found', 404));
                }
            } else {
                deferred.reject(error);
            }
        });

        return deferred.promise;
    };

    kibana.createDashboard = function (dashboard, activityId, esClient, config, user) {
        var deferred = Q.defer();
        console.log('kibana.createDashboard() -> started!');

        kibana.addIndexObject(activityId, esClient)
            .then(function() {
                esClient.index({
                    index: '.kibana',
                    type: 'dashboard',
                    id: 'dashboard_' + activityId,
                    body: dashboard
                }, function (error, response) {
                    if (!error) {
                        console.log('kibana.createDashboard() -> ADDED!');

                        var visualizations = JSON.parse(dashboard.panelsJSON);
                        var kibanaResources = ['dashboard_' + activityId];

                        for (var i = 0; i < visualizations.length; i++) {
                            kibanaResources.push(visualizations[i].id);
                        }

                        kibana.updateActivityPermissions(activityId, kibanaResources, config, user)
                            .then(function() {
                                console.log('kibana.createDashboard() -> Success!');

                                deferred.resolve();
                            })
                            .fail(function(err) {
                                console.log('kibana.createDashboard() -> ERROR!');

                                deferred.reject(error);
                            });
                    } else {
                        deferred.reject(error);
                    }
                });
            })
            .fail(function(error) {
                deferred.reject(error);
            });

        return deferred.promise;
    };

    kibana.addIndexObject = function(activityId, esClient) {
        var deferred = Q.defer();

        esClient.indices.exists({index: activityId}, function (err, exists) {
            console.log('Including object in new activity');
            if (err || !exists) {
                kibana.getIndexObject(activityId, esClient)
                    .then(function(indexObject) { return kibana.insertIndexObject(activityId, indexObject, esClient); })
                    .then(function() {
                        deferred.resolve();
                    })
                    .catch(function(error) {
                        deferred.reject(error);
                    });
            } else {
                deferred.resolve();
            }
        });
        return deferred.promise;
    };

    kibana.getIndexObject = function(activityId, esClient) {
        var deferred = Q.defer();

        var activities = require('../activities');

        var indexObject = defaultObject;
        activities.findById(activityId)
            .then(function (activityObj) {
                if (activityObj) {
                    esClient.search({
                        index: '.objectfields',
                        type: 'object_fields',
                        q: '_id:' + 'object_fields' + activityObj.versionId
                    }, function (error, response) {
                        if (!error && response.hits.hits && response.hits.hits.length > 0) {
                            indexObject = response.hits.hits[0]._source;
                        }

                        deferred.resolve(indexObject);
                    });
                }
            })
            .fail(function(error) {
                deferred.reject(error);
            });

        return deferred.promise;
    };

    kibana.insertIndexObject = function(activityId, indexObject, esClient) {
        var deferred = Q.defer();

        esClient.index({
            index: activityId,
            type: 'traces',
            body: indexObject
        }, function (error, created) {
            if (error) {
                deferred.reject();
            }else {
                deferred.resolve();
            }
        });

        return deferred.promise;
    };

    kibana.updateActivityPermissions = function(activityId, kibanaResources, config, user) {
        var deferred = Q.defer();

        var activities = require('../activities');

        activities.findById(activityId)
            .then(function (activityObj) {
                console.log('kibana.updateActivityPermissions -> Activity Found');

                var total = 1, max = 0;
                var Completed = function() {
                    total++;
                    console.log('kibana.updateActivityPermissions -> completed: ' + total + '/' + max);
                    if (total > max) {
                        kibana.updateKibanaPermission(config, user, kibanaResources, function (e, res) {
                            if (e) {
                                return deferred.reject(e);
                            }
                            deferred.resolve(res);
                        });
                    }
                };

                if (activityObj && activityObj.students) {
                    max = activityObj.students.length;
                    activityObj.students.forEach(function (stu) {
                        console.log('kibana.updateActivityPermissions -> Student started');
                        kibana.updateKibanaPermission(config, stu, kibanaResources, function (err) {
                            if (err) {
                                console.log('kibana.updateActivityPermissions -> Student ERROR!');
                                deferred.reject(err);
                            }else {
                                Completed();
                            }
                        });
                    });
                }else {
                    console.log('kibana.updateActivityPermissions -> no students');
                    Completed();
                }
            })
        .fail(function(error) {
            console.log('kibana.updateActivityPermissions -> Error finding activity ' + activityId);
            deferred.reject(error);
        });

        return deferred.promise;
    };

    /**
     * Logs in as an admin and tries to set the permissions for the user that
     * performed the request
     * @param config
     * @param data The Lookup permissions, e.g.
     *     {
     *          "key":"_id",
     *          "user": "dev"
     *          "resource":"id1",
     *          "methods":["post","put"],
     *          "url":"/url/*"
     *      }
     * @param callback
     */

    kibana.updateKibanaPermission = function (config, user, resources, callback) {
        var baseUsersAPI = config.a2.a2ApiPath;
        request.post(baseUsersAPI + 'login', {
                form: {
                    username: config.a2.a2AdminUsername,
                    password: config.a2.a2AdminPassword
                },
                json: true
            },
            function (err, httpResponse, body) {
                if (err) {
                    return callback(err);
                }

                if (!body.user || !body.user.token) {
                    var tokenErr = new Error('No user token (Wrong admin credentials)');
                    tokenErr.status = 403;
                    return callback(tokenErr);
                }

                request({
                    uri: baseUsersAPI + 'applications/look/kibana',
                    method: 'PUT',
                    body: {
                        key: 'docs._id',
                        user: user,
                        resources: resources,
                        methods: ['post', 'put'],
                        url: '/elasticsearch/_mget'
                    },
                    json: true,
                    headers: {
                        Authorization: 'Bearer ' + body.user.token
                    }
                }, function (err, httpResponse, body) {
                    if (err) {
                        return callback(err);
                    }

                    callback();
                });
            });
    };

    /**
     * Creates a resources array to define the correct permissions
     * @param indexName
     * @param config
     * @param esClient
     */

    kibana.buildKibanaResources = function (indexName, config, esClient) {
        var deferred = Q.defer();

        console.log('kibana.buildKibanaResources -> Started!');

        esClient.search({
            size: 1,
            from: 0,
            index: '.kibana',
            type: 'config'
        }, function (error, response) {
            if (error) {
                return deferred.reject(error);
            }
            var resources = [];
            if (response.hits && response.hits.hits.length > 0) {
                response.hits.hits.forEach(function (hit) {
                    resources.push(hit._id);
                });
                resources.push(config.kibana.defaultIndex);
                resources.push(indexName);
                resources.push('thomaskilmann-' + indexName);

                console.log('kibana.buildKibanaResources -> SUCCESS!');
                deferred.resolve(resources);
            } else {
                console.log('kibana.buildKibanaResources -> ERROR!');
                deferred.reject(new Error('No Kibana version found!'));
            }
        });

        return deferred.promise;
    };

    return kibana;
})();
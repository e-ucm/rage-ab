'use strict';

var express = require('express'),
    router = express.Router(),
    kibana = require('../lib/kibana/kibana');

/**
 * @api {post} /api/kibana/templates/:type/:id Adds a new template in .template index of ElasticSearch.
 * @apiDescription :type must be visualization or index
 * @apiName PostTemplate
 * @apiGroup Template
 *
 * @apiParam {String} id The visualization id
 * @apiParam {String} type Visualization or index
 *
 * @apiSuccess(200) Success.
 *
 * @apiSuccessExample Success-Response:
 *      HTTP/1.1 200 OK
 *      {
 *          "_index": ".template",
 *          "_type": "visualization",
 *          "_id": "template_visualization",
 *          "_version": 1,
 *          "_shards": {
 *              "total": 2,
 *              "successful": 1,
 *              "failed": 0
 *          },
 *          "created": true
 *      }
 */
router.post('/templates/:type/:id', function (req, res) {
    if (req.params.type !== 'visualization' && req.params.type !== 'index') {
        res.json('Invalid type parameter', 400);
    } else {
        req.app.esClient.index({
            index: '.template',
            type: req.params.type,
            id: req.params.id,
            body: req.body
        }, function (error, response) {
            if (!error) {
                res.json(response);
            } else {
                res.status(error.status);
                res.json(error);
            }
        });
    }
});

/**
 * @api {post} /api/kibana/templates/:type/author/:idAuthor Adds a new template in .template index of ElasticSearch.
 * @apiDescription :type must be visualization or index
 * @apiName PostTemplate
 * @apiGroup Template
 *
 * @apiParam {String} type The template type
 * @apiParam {String} idAuthor The author of template
 *
 * @apiSuccess(200) Success.
 *
 * @apiSuccessExample Success-Response:
 *      HTTP/1.1 200 OK
 *      {
 *          "_index": ".template",
 *          "_type": "visualization",
 *          "_id": "template_visualization",
 *          "_version": 1,
 *          "_shards": {
 *              "total": 2,
 *              "successful": 1,
 *              "failed": 0
 *          },
 *          "created": true
 *      }
 */
router.post('/templates/:type/author/:idAuthor', function (req, res) {
    req.app.esClient.search({
        size: 100,
        from: 0,
        index: '.template',
        type: req.params.type,
        body: {
            query: {
                bool: {
                    must: [
                        {
                            match: {
                                author: '\\:' + req.params.idAuthor + '\\:'
                            }
                        },
                        {
                            match: {
                                title: '\\:' + req.body.title + '\\:'
                            }
                        }
                    ],
                    filter: [
                        {
                            term: {
                                author: req.params.idAuthor
                            }
                        },
                        {
                            term: {
                                title: req.body.title
                            }
                        }
                    ]
                }
            }
        }
    }, function (error, response) {
        if (!error) {
            var obj = {
                index: '.template',
                type: req.params.type,
                body: req.body
            };
            if (response.hits && response.hits.hits.length > 0) {
                obj.id = response.hits.hits[0]._id;
            }
            req.body.author = req.params.idAuthor;
            req.app.esClient.index(obj, function (error, response) {
                if (!error) {
                    res.json(response);
                } else {
                    res.status(error.status);
                    res.json(error);
                }
            });
        } else {
            res.status(error.status);
            res.json(error);
        }
    });

    if (req.params.type !== 'visualization' && req.params.type !== 'index') {
        res.json('Invalid type parameter', 300);
    } else {

    }
});

/**
 * @api {get} /api/kibana/templates/:idAuthor Return a list with the author's visualizations.
 * @apiName GetVisualization
 * @apiGroup Template
 *
 * @apiParam {String} idAuthor The author id
 *
 * @apiSuccess(200) Success.
 *
 * @apiSuccessExample Success-Response:
 *      HTTP/1.1 200 OK
 *      [{
 *          id: 'visualization1',
 *          title: 'title1'
 *          isDeveloper: false,
 *          isTeacher: false
 *        },{
 *          id: 'visualization2',
 *          title: 'title2'
 *          isDeveloper: true,
 *          isTeacher: true
 *        },{'
 *          id: 'visualization5',
 *          title: 'title5',
 *          isDeveloper: true,
 *          isTeacher: false
 *        }]
 */
router.get('/templates/:idAuthor', function (req, res) {
    req.app.esClient.search({
        size: 100,
        from: 0,
        index: '.template',
        q: 'author:' + req.params.idAuthor
    }, function (error, response) {
        if (!error) {
            var result = [];
            if (response.hits) {
                for (var i = 0; i < response.hits.hits.length; i++) {
                    result[i] = {
                        id: response.hits.hits[i]._id,
                        title: response.hits.hits[i]._source.title,
                        isDeveloper: response.hits.hits[i]._source.isDeveloper,
                        isTeacher: response.hits.hits[i]._source.isTeacher
                    };
                }
            }
            res.json(result);
        } else {
            res.status(error.status);
            res.json(error);
        }
    });
});

/**
 * @api {get} /api/kibana/templates/index/:id Return the template with the id.
 * @apiName GetTemplate
 * @apiGroup Template
 *
 * @apiParam {String} id The template id
 *
 * @apiSuccess(200) Success.
 *
 * @apiSuccessExample Success-Response:
 *      HTTP/1.1 200 OK
 *      {
 *          "_index": ".template",
 *          "_type": "index",
 *          "_id": "5767d5852fc65e241be46b71",
 *          "_score": 1,
 *          "_source": {
 *          "title": "defaultIndex",
 *          "timeFieldName": "timestamp",
 *          "fields": "[{\"name\":\"_index\",\"type\":\"string\",\"count\":0,\"scripted\":false,\"indexed\":false,\"analyzed\":false,\"doc_values\":false}]"
 *      }
 *
 */
router.get('/templates/index/:id', function (req, res) {
    req.app.esClient.search({
        index: '.template',
        q: '_id:' + req.params.id
    }, function (error, response) {
        if (!error) {
            if (response.hits.hits[0]) {
                res.json(response.hits.hits[0]);
            } else {
                res.json(new Error('Template not found', 404));
            }
        } else {
            res.status(error.status);
            res.json(error);
        }
    });
});

/**
 * @api {get} /api/kibana/templates/fields/:id Return the fields of visualization with the id.
 * @apiName GetVisualizationFields
 * @apiGroup Template
 *
 * @apiParam {String} id The visualization id
 *
 * @apiSuccess(200) Success.
 *
 * @apiSuccessExample Success-Response:
 *      HTTP/1.1 200 OK
 *      ['field1', 'field2', 'field3']
 */
router.get('/templates/fields/:id', function (req, res) {
    req.app.esClient.search({
        index: '.template',
        q: '_id:' + req.params.id
    }, function (error, response) {
        if (!error) {
            var result = [];
            if (response.hits.hits[0]) {
                var re = /"field":"([\w+.?]+)"/g;

                var sourceField = 'visState';
                if (response.hits.hits[0]._type === 'index') {
                    sourceField = 'fields';
                    re = /"name":"([^_](\w+.?)+)"/g;
                }

                var pos = 0;
                var m;
                while ((m = re.exec(response.hits.hits[0]._source[sourceField])) !== null) {
                    if (!exist(result, m[1])) {
                        result[pos] = m[1];
                        pos++;
                    }

                    if (m.index === re.lastIndex) {
                        re.lastIndex++;

                    }
                }
            }
            res.json(result);
        } else {
            res.status(error.status);
            res.json(error);
        }
    });
});

function exist(result, element) {
    var exist = false;
    result.forEach(function (str) {
        if (str === element) {
            exist = true;
        }
    });
    return exist;
}

/**
 * @api {get} /api/kibana/object/:versionId Return the index with the id.
 * @apiName GetIndexObject
 * @apiGroup Object
 *
 * @apiParam {String} gameId The game id
 *
 * @apiSuccess(200) Success.
 */
router.get('/object/:versionId', function (req, res) {
    req.app.esClient.search({
        index: '.objectfields',
        type: 'object_fields',
        q: '_id:' + 'object_fields' + req.params.versionId
    }, function (error, response) {
        if (!error) {
            if (response.hits.hits && response.hits.hits.length > 0) {
                res.json(response.hits.hits[0]._source);
            } else {
                res.json(kibana.defaultObject);
            }
        } else {
            if (error.status === 404) {
                res.json(kibana.defaultObject);
            } else {
                res.status(error.status);
                res.json(error);
            }
        }
    });
});

/**
 * @api {post} /api/kibana/object/:versionId saves the given index object
 * @apiName PostIndexObject
 * @apiGroup Object
 *
 * @apiParam {String} id The visualization id
 *
 * @apiSuccess(200) Success.
 */

router.post('/object/:versionId', function (req, res) {
    req.app.esClient.index({
        index: '.objectfields',
        type: 'object_fields',
        id: 'object_fields' + req.params.versionId,
        body: req.body
    }, function (error, response) {
        if (!error) {
            res.json(response);
        } else {
            res.status(error.status);
            res.json(error);
        }
    });
});


/**
 * @api {post} /api/kibana/visualization/game/:gameId/:id Adds a new visualization with the index fields of game gameId.
 * @apiName PostVisualization
 * @apiGroup GameVisualization
 *
 * @apiParam {String} gameId The game id
 *
 * @apiSuccess(200) Success.
 *
 * @apiSuccessExample Success-Response:
 *      HTTP/1.1 200 OK
 *      {
 *          "_index": ".games",
 *          "_type": "visualization",
 *          "_id": "testing",
 *          "_version": 1,
 *          "_shards": {
 *              "total": 2,
 *              "successful": 1,
 *              "failed": 0
 *          },
 *          "created": true
 *      }
 */
router.post('/visualization/game/:gameId/:id', function (req, res) {
    req.app.esClient.search({
        index: '.games' + req.params.gameId,
        type: 'fields',
        q: '_id:fields' + req.params.gameId
    }, function (error, response) {
        var fieldsObj = {};
        if (!error && response.hits.hits[0]) {
            fieldsObj = response.hits.hits[0]._source;
        }
        if (req.body.visualizationTemplate) {
            setGameVisualizationByTemplate(req, res, req.body.visualizationTemplate, fieldsObj);
        } else {
            req.app.esClient.search({
                index: '.template',
                q: '_id:' + req.params.id
            }, function (error, response) {
                if (!error) {
                    // Replace template and save it
                    if (response.hits.hits[0]) {
                        var obj = response.hits.hits[0]._source;
                        setGameVisualizationByTemplate(req, res, obj, fieldsObj);
                    } else {
                        res.json(new Error('Template not found', 404));
                    }
                } else {
                    res.status(error.status);
                    res.json(error);
                }
            });
        }
    });
});

var setGameVisualizationByTemplate = function (req, res, obj, fields) {
    Object.keys(fields).forEach(function (key) {
        obj.visState = obj.visState.replace(new RegExp(key, 'g'), fields[key]);
    });
    req.app.esClient.index({
        index: '.games' + req.params.gameId,
        type: 'visualization',
        id: req.params.id,
        body: obj
    }, function (error, response) {
        if (!error) {
            return res.json(response);
        }

        return res.json(error);
    });
};

/**
 * @api {get} /api/kibana/tuples/fields/game/:id Return the values that use a game for the visualizations
 * @apiName GetVisualizationValues
 * @apiGroup GameVisualization
 *
 * @apiParam {String} id The game id
 *
 * @apiSuccess(200) Success.
 *
 * @apiSuccessExample Success-Response:
 *      HTTP/1.1 200 OK
 *      {
 *          "date": "time_field",
 *          "score": "score_var",
 *          "progress": "percentage"
 *      }
 */
router.get('/visualization/tuples/fields/game/:id', function (req, res) {
    req.app.esClient.search({
        index: '.games' + req.params.id,
        type: 'fields',
        q: '_id:fields' + req.params.id
    }, function (error, response) {
        if (!error) {
            if (response.hits.hits[0]) {
                res.json(response.hits.hits[0]._source);
            } else {
                res.json(new Error('Fields not found', 404));
            }
        } else {
            res.status(error.status);
            res.json(error);
        }
    });
});

/**
 * @api {post} /api/kibana/tuples/fields/game/:id Add the values that use a game for the visualizations
 * @apiName PostVisualizationValues
 * @apiGroup GameVisualization
 *
 * @apiParam {String} id The visualization id
 *
 * @apiParamExample {json} Request-Example:
 *      {
 *          "date": "time_field",
 *          "score": "score_var",
 *          "progress": "percentage"
 *      }
 *
 * @apiSuccess(200) Success.
 *
 * @apiSuccessExample Success-Response:
 *      HTTP/1.1 200 OK
 *      {
 *          "_index": ".games123",
 *          "_type": "fields",
 *          "_id": "fields123",
 *          "_version": 1,
 *          "_shards": {
 *              "total": 2,
 *              "successful": 1,
 *              "failed": 0
 *          },
 *          "created": true
 *      }
 */
router.post('/visualization/tuples/fields/game/:id', function (req, res) {
    req.app.esClient.index({
        index: '.games' + req.params.id,
        type: 'fields',
        id: 'fields' + req.params.id,
        body: req.body
    }, function (error, response) {
        if (!error) {
            res.json(response);
        } else {
            res.status(error.status);
            res.json(error);
        }
    });
});

/**
 * @api {get} /api/kibana/visualization/list/:usr/:id Return the list of visualizations used in a game with the id.
 * @apiName GetVisualizationList
 * @apiGroup GameVisualization
 *
 * @apiParam {String} id The game id
 * @apiParam {String} usr The role of the user (dev, tch or all)
 *
 * @apiSuccess(200) Success.
 *
 * @apiSuccessExample Success-Response:
 *      HTTP/1.1 200 OK
 *          [
 *              "56962ebf5d817ba040bdca5f",
 *              "56962eb123d17ba040bdca5f"
 *          ]
 */
router.get('/visualization/list/:usr/:id', function (req, res) {
    kibana.getVisualizations(req.params.usr, req.params.id, req.app.esClient)
        .then(function(visualizations) {
            res.json(visualizations);
        })
        .fail(function(error) {
            res.status(error.status);
            res.json(error);
        });
});

/**
 * @api {post} /api/kibana/visualization/list/:id Add the list of visualizations used in a game.
 * @apiName PostVisualizationList
 * @apiGroup GameVisualization
 *
 * @apiParam {String} id The game id
 *
 * @apiParamExample {json} Request-Example:
 * {
 *        "visualizationsTch": [
 *          "SessionActivityOverTime",
 *          "PlayersActivity",
 *          "DifferentAlternativesPreferred",
 *          "TotalSessionPlayers",
 *          "AlternativesResponsesCount",
 *          "xAPIVerbsActivity",
 *          "AlternativesCountPerPlayer",
 *        ],
 *        "visualizationsDev": [
 *          "SessionActivityOverTime",
 *          "TotalSessionPlayers",
 *          "ActivityCountPerPlayer",
 *          "AlternativesResponsesCount",
 *          "PlayersActivityOverTime"
 *        ]
 *
 * }
 *
 * @apiSuccess(200) Success.
 *
 * @apiSuccessExample Success-Response:
 *      HTTP/1.1 200 OK
 *      {
 *          "_index": ".games123",
 *          "_type": "list",
 *          "_id": "123",
 *          "_version": 1,
 *          "_shards": {
 *              "total": 2,
 *              "successful": 1,
 *              "failed": 0
 *          },
 *          "created": true
 *      }
 */
router.post('/visualization/list/:id', function (req, res) {
    req.app.esClient.index({
        index: '.games' + req.params.id,
        type: 'list',
        id: req.params.id,
        body: req.body
    }, function (error, response) {
        if (!error) {
            res.json(response);
        } else {
            res.status(error.status);
            res.json(error);
        }
    });
});

/**
 * @api {put} /api/kibana/visualization/list/:id Update the list of visualizations used in a game.
 * @apiName UpdateVisualizationList
 * @apiGroup GameVisualization
 *
 * @apiParam {String} id The game id
 *
 * @apiParamExample {json} Request-Example:
 * {
 *        "visualizationsDev": [
 *          "SessionActivityOverTime",
 *        ]
 * }
 *
 * @apiSuccess(200) Success.
 *
 * @apiSuccessExample Success-Response:
 *      HTTP/1.1 200 OK
 *      {
 *          "_index": ".games",
 *          "_type": "list",
 *          "_id": "visualization_list",
 *          "_version": 1,
 *          "_shards": {
 *              "total": 2,
 *              "successful": 1,
 *              "failed": 0
 *          },
 *          "created": true
 *      }
 */
router.put('/visualization/list/:id', function (req, res) {
    req.app.esClient.search({
        index: '.games' + req.params.id,
        type: 'list',
        q: '_id:' + req.params.id
    }, function (error, response) {
        if (!error) {
            if (response.hits.hits[0]) {
                response = response.hits.hits[0]._source;
                if (!response.visualizationsDev) {
                    response.visualizationsDev = [];
                }

                if (!response.visualizationsTch) {
                    response.visualizationsTch = [];
                }

                if (req.body.visualizationsDev) {
                    for (var i = 0; i < req.body.visualizationsDev.length; i++) {
                        addDifferents(response.visualizationsDev, req.body.visualizationsDev[i]);
                    }
                }
                req.body.visualizationsDev = response.visualizationsDev;

                if (req.body.visualizationsTch) {
                    for (var j = 0; j < req.body.visualizationsTch.length; j++) {
                        addDifferents(response.visualizationsTch, req.body.visualizationsTch[j]);
                    }
                }
                req.body.visualizationsTch = response.visualizationsTch;
            }

            req.app.esClient.index({
                index: '.games' + req.params.id,
                type: 'list',
                id: req.params.id,
                body: req.body
            }, function (error, response) {
                if (!error) {
                    res.json(req.body);
                } else {
                    res.status(error.status);
                    res.json(error);
                }
            });
        }
    });
});

function addDifferents(array, obj) {
    var addObj = true;
    array.forEach(function (v) {
        if (v === obj) {
            addObj = false;
        }
    });

    if (addObj) {
        array.push(obj);
    }
}

/**
 * @api {delete} /api/kibana/visualization/list/:gameId/:list/:idToRemove Remove the visualization with idToRemove of the game gameId.
 * @apiName RemoveVisualizationList
 * @apiGroup GameVisualization
 *
 * @apiParam {String} gameId The list id
 * @apiParam {String} list The list
 * @apiParam {String} idToRemove The id to remove
 *
 * @apiSuccess(200) Success.
 *
 * @apiSuccessExample Success-Response:
 *      HTTP/1.1 200 OK
 *      {
 *          "visualizationsDev": [
 *              "UserScore_56962ebf5d817ba040bdca5f"
 *          ],
 *          "visualizationsTch": []
 *      }
 */
router.delete('/visualization/list/:gameId/:list/:idToRemove', function (req, res) {
    req.app.esClient.search({
        index: '.games' + req.params.gameId,
        type: 'list',
        q: '_id:' + req.params.gameId
    }, function (error, response) {
        if (!error) {
            if (response.hits.hits[0]) {
                var obj = response.hits.hits[0]._source;

                var i = 0;
                var list;
                if (req.params.list === 'dev') {
                    list = obj.visualizationsDev ? obj.visualizationsDev : [];
                } else {
                    list = obj.visualizationsTch ? obj.visualizationsTch : [];
                }

                list.forEach(function (v) {
                    if (v === req.params.idToRemove) {
                        list.splice(i, 1);
                    }
                    i++;
                });

                if (req.params.list === 'dev') {
                    obj.visualizationsDev = list;
                } else {
                    obj.visualizationsTch = list;
                }

                req.app.esClient.index({
                    index: '.games' + req.params.gameId,
                    type: 'list',
                    id: req.params.gameId,
                    body: obj
                }, function (error, response) {
                    if (!error) {
                        res.json(obj);
                    } else {
                        res.status(error.status);
                        res.json(error);
                    }
                });
            } else {
                res.json([]);
            }
        } else {
            res.status(error.status);
            res.json(error);
        }
    });
});

/**
 * @api {post} /api/kibana/index/:indexTemplate/:indexName Adds a new index using the template indexTemplate of ElasticSearch.
 * @apiName PostIndex
 * @apiGroup Kibana
 *
 * @apiParam {String} indexTemplate The index template id
 * @apiParam {String} indexName The index name
 * @apiParam {String} activityId The activity id
 *
 * @apiSuccess(200) Success.
 *
 * @apiSuccessExample Success-Response:
 *      HTTP/1.1 200 OK
 *      {
 *          "_index": ".kibana",
 *          "_type": "index-pattern",
 *          "_id": "0535H53W34g",
 *          "_version": 1,
 *          "_shards": {
 *              "total": 2,
 *              "successful": 1,
 *              "failed": 0
 *          },
 *          "created": true
 *      }
 */
router.post('/index/:indexTemplate/:indexName', function (req, res) {
    kibana.createRequiredIndexes(req.params.indexName, req.params.indexTemplate,
        req.headers['x-gleaner-user'], req.app.config, req.app.esClient)
        .then(function(response) {
            res.json(response);
        })
        .fail(function(error) {
            res.status(error.status);
            res.json(error);
        });
});

/**
 * @api {post} /api/kibana/visualization/activity/:gameId/:visualizationId/:activityId Adds new visualization using the template visualizationId.
 * @apiName PostVisualization
 * @apiGroup Kibana
 *
 * @apiParam {String} gameId The game id
 * @apiParam {String} visualizationId The visualization id
 * @apiParam {String} activityId The activity id
 *
 * @apiSuccess(200) Success.
 *
 * @apiSuccessExample Success-Response:
 *      HTTP/1.1 200 OK
 *      {
 *          "_index": ".kibana",
 *          "_type": "visualization",
 *          "_id": "activityId",
 *          "_version": 1,
 *          "_shards": {
 *              "total": 2,
 *              "successful": 1,
 *              "failed": 0
 *          },
 *          "created": true
 *      }
 */
router.post('/visualization/activity/:gameId/:visualizationId/:activityId', function (req, res) {
    kibana.cloneVisualizationForActivity(req.params.gameId, req.params.visualizationId,
        req.params.activityId, req.app.esClient)
        .then(function(result) {
            res.json(result);
        })
        .fail(function(error) {
            res.status(error.status);
            res.json(error);
        });
});

/**
 * @api {post} /api/kibana/dashboard/activity/:activityId Adds a new dashboard in .kibana index of ElasticSearch.
 * @apiName PostDashboard
 * @apiGroup Kibana
 *
 * @apiParam {String} id The activity id
 *
 * @apiParamExample {json} Request-Example:
 *      {
 *          "title": "dashboard_123",
 *          "description2": "default visualization",
 *          "panelsJSON": "[{ id:visualization_123, type:visualization, panelIndex: 1, size_x:3, size_y:2, col:1, row:1}]",
 *          "optionsJSON": "{"darkTheme":false}",
 *          "uiStateJSON": "{vis: {legendOpen: false}}",
 *          "version": 1,
 *          "timeRestore": false,
 *          "kibanaSavedObjectMeta": {
 *              searchSourceJSON: '{"filter":[{"query":{"query_string":{"query":"*","analyze_wildcard":true}}}]}'
 *          }
 *      }
 *
 * @apiSuccess(200) Success.
 *
 * @apiSuccessExample Success-Response:
 *      HTTP/1.1 200 OK
 *      {
 *          "_index": ".kibana",
 *          "_type": "visualization",
 *          "_id": "activityId",
 *          "_version": 1,
 *          "_shards": {
 *              "total": 2,
 *              "successful": 1,
 *              "failed": 0
 *          },
 *          "created": true
 *      }
 */
router.post('/dashboard/activity/:activityId', function (req, res) {
    kibana.createDashboard(req.body, req.params.activityId, req.app.esClient, req.app.config,
        req.headers['x-gleaner-user'])
        .then(function(result) {
            res.json(result);
        })
        .fail(function(error) {
            res.status(error.status);
            res.json(error);
        });
});

// jscs:enable requireCamelCaseOrUpperCaseIdentifiers
module.exports = router;
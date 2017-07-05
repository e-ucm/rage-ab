/*
 * Copyright 2016 e-UCM (http://www.e-ucm.es/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * This project has received funding from the European Union’s Horizon
 * 2020 research and innovation programme under grant agreement No 644187.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0 (link is external)
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var should = require('should'),
    async = require('async'),
    ObjectID = require('mongodb').ObjectId;

var idSession = new ObjectID('dummyGameId0');

module.exports = function (app, esClient, mongo) {
    
    /**-------------------------------------------------------------**/
    /**-------------------------------------------------------------**/
    /**              Test Elastic Transformer To v2                 **/
    /**-------------------------------------------------------------**/
    /**-------------------------------------------------------------**/
    describe('Elastic TransformTo2 test', function () {
        this.timeout(25000);
        app.config.elasticsearch.esClient = esClient;
        app.config.mongodb.db = mongo;
        mongo.collection('sessions').insert(
            {
                _id: idSession,
                title: 'Dummy'
            }, function () {
                
            });

        beforeEach(function (done) {
            app.esClient.indices.delete({
                index: '_all'
            }, function (error, response){
                done(error);
            });

        });

        it('should transform correctly traces extensions', function (done) {
            var fileIn = './upgradeInputs/tracesTo2IN.js';
            var fileOut = './upgradeInputs/tracesTo2OUT.js'; //CHANGE TO OUT
            var searchObj = {
                index: idSession.toString(),
                type: 'traces'
            };
            
            async.waterfall([function(callback){
                callback(null, fileIn, fileOut, idSession.toString(), searchObj)},
                bulkFunction,
                transformFunction,
                compareFunction
            ], function (err, result){
                if (err) {
                    return done(err);
                }
                return done();
            });
        });


        it('should transform correctly .kibana index', function (done) {
            var fileIn = './upgradeInputs/kibanaIndexTo2IN.js';
            var fileOut = './upgradeInputs/kibanaIndexTo2OUT.js'; //CHANGE TO OUT
            var searchObj = {
                index: '.kibana'
            };

            async.waterfall([function(callback){
                callback(null, fileIn, fileOut, '.kibana', searchObj)},
                bulkFunction,
                transformFunction,
                compareFunction
            ], function (err, result){
                if (err) {
                    return done(err);
                }
                return done();
            });
        });

        it('should transform correctly .game indices', function (done) {
            var fileIn = './upgradeInputs/gameIndexTo2IN.js';
            var fileOut = './upgradeInputs/gameIndexTo2OUT.js'; //CHANGE TO OUT
            var searchObj = {
                index: '.games1234'
            };

            async.waterfall([function(callback){
                callback(null, fileIn, fileOut, '.games1234', searchObj)},
                bulkFunction,
                transformFunction,
                compareFunction
            ], function (err, result){
                if (err) {
                    return done(err);
                }
                return done();
            });
        });

    });

    function bulkFunction(fileIn, fileOut, index, searchObj, callback){
        var bodyIn = require(fileIn);

        var bulkBody = { body: []};

        bodyIn.forEach(function(doc){
            // action description
            bulkBody.body.push({ index:  {
                _index: index ? index : doc.index,
                _type: doc.type,
                _id : doc.id
            }});
            // document to index
            bulkBody.body.push(doc.source);
        });
        // fill DB
        app.esClient.bulk(bulkBody, function (error, response) {
            if (error) {
                return callback(error);
            }
            setTimeout(function() {
                callback(null, fileIn, fileOut, idSession, searchObj);
            }, 2000);
        });
    }

    function transformFunction(fileIn, fileOut, idSession, searchObj, callback){
        // apply transform
        var t = require('../../../bin/upgrade/transformers/elastic/transformToVersion2.js');
        async.waterfall([function (newCallback) {
            newCallback(null, app.config);
        },  t.backup,
            t.upgrade,
            t.check
        ], function (err, result) {
            if (err) {
                return callback(err);
            }
            callback(null, fileIn, fileOut, idSession, searchObj);
        });
    }

    function compareFunction(fileIn, fileOut, idSession, searchObj, callback){
        var bodyOut = require(fileOut);

        setTimeout(function() {
            app.esClient.search(searchObj, function (err, response) {
                console.log("SEARCH RESPONSE: ", JSON.stringify(response));
                if(err){
                    return callback(err);
                }
                if(response.hits.hits.length === bodyOut.length) {
                    var error = null;
                    bodyOut.forEach(function(doc1){
                        var doc2;
                        response.hits.hits.forEach(function (doc){
                            if(doc._id.toString() === doc1.id.toString() && doc._type === doc1.type){
                                if(compareDocuments(doc._source, doc1.source)){
                                    doc2 = doc;
                                }
                            }
                        });
                        if(!doc2){
                            error = new Error('The result DB and the OUT expected documents are different');
                            console.error("Document not FOUND: "+JSON.stringify(doc1));
                        }
                    });
                    return callback(error);
                }
                return callback(new Error('The OUT expected ('+bodyOut.length+') and OUT transform('+response.hits.hits.length+') lenght  document are different'))
            });
        }, 2000);
    }

    function compareDocuments(doc1, doc2){
        var equal = true;
        if(doc1 === undefined && doc2 === undefined || doc1 === null &&  doc2 === null){
            return true;
        }
        if(!doc1 || !doc2){
            console.log("ERROR COMPARING VALUES (SOME VALUE IS NOT VALID): ", doc1, " AND ", doc2);
            return false;
        }
        Object.keys(doc1).forEach(function(key) {
            var val = doc1[key];
            if(typeof(val) !== typeof({})){
                if(val !== doc2[key]){
                    console.log("ERROR COMPARING VALUES: ", val, " (",typeof(val),") AND ", doc2[key]," (",typeof(val),")");
                    equal = false;
                }
                if(typeof(val) !== typeof(doc2[key])){
                    console.log("ERROR COMPARING TYPES: ", val, " AND ", doc2[key])
                    equal = false;
                }
            } else {
                equal = compareDocuments(val, doc2[key]);
            }
        });
        return equal;
    }
};

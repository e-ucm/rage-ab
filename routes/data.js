'use strict';

var express = require('express'),
    moment = require('moment'),
    router = express.Router(),
    restUtils = require('./rest-utils'),
    classes = require('../lib/classes'),
    request = require('request'),
    Q = require('q');

router.get('/overall/:studentid', function (req, res) {

    var analysisresult =
    {
        student: req.params.studentid,
        scores: {
            min: 0.2,
            avg: 0.7,
            max: 0.95
        },
        durations: {
            yours: 0.5,
            others: 0.7
        },
        alternatives: {
            correct: 6,
            incorrect: 2
        },
        progress: 0.8
    };

    res.send(analysisresult);
});

router.get('/overall_full/:studentid', function (req, res) {
    var studentId = req.params.studentId;

    if (!studentId) {
        res.status(400);
        return res.json({message: 'Invalid studentId'});
    }

    var deferred = Q.defer();

    req.app.esClient.search({
        size: 200,
        from: 0,
        index: 'results-beaconing-overall',
        q: '_id:' + studentId.toString()
    }, function (error, response) {
        if (error) {
            if (response.error && response.error.type === 'index_not_found_exception') {
                return deferred.resolve([]);
            }
            return deferred.reject(new Error(error));
        }

        var analysisresult =
        {
            sudent: req.params.studentid,
            scores: {
                min: 0.2,
                avg: 0.7,
                max: 0.95
            },
            durations: {
                yours: 0.5,
                others: 0.7
            },
            alternatives: {
                correct: 0,
                incorrect: 0
            },
            progress: 0.8
        };

        if (response.hits && response.hits.hits.length) {
            response.hits.hits.forEach(function (document) {
                if (document._source) {
                    document._source._id = document._id;
                    if (document._source.selected) {
                        if (document._source.selected.true) {
                            analysisresult.alternatives.correct += document._source.selected.true;
                        }
                        if (document._source.selected.false) {
                            analysisresult.alternatives.incorrect += document._source.selected.false;
                        }
                    }
                }
            });
        }

        deferred.resolve(analysisresult);
    });

    restUtils.processResponse(deferred.promise, res);
});

router.get('/performance_full/:groupid', function (req, res) {
    var periodStart = req.query.periodStart;
    var scale = req.query.scale;
    var groupid = req.params.groupid;

    if (!groupid) {
        res.status(400);
        return res.json({message: 'Invalid groupid'});
    }

    if (!scale) {
        res.status(400);
        return res.json({message: 'Invalid time scale'});
    }
    if (scale !== 'year' && scale !== 'month' && scale !== 'week') {
        res.status(400);
        return res.json({message: 'Time scale should be: year, month or week.'});
    }

    var fdate;
    if (!periodStart) {
        fdate = moment();
    } else {
        fdate = moment(periodStart);
        if (!fdate.isValid()) {
            res.status(400);
            return res.json({message: 'Invalid date format, should be ISO 8601'});
        }
    }

    var analysisresult = {
        classId: groupid,
        students: [],
        improvement: [],
        year: fdate.year()
    };

    if (scale === 'week') {
        analysisresult.week = fdate.week();
    }else if (scale === 'month') {
        analysisresult.month = fdate.month();
    }

    var username = req.headers['x-gleaner-user'];
    restUtils.processResponse(classes.isAuthorizedForExternal('beaconing', groupid, username, 'get', '/classes/external/:domain/:externalId')
        .then(function (classReq) {
            var fdate;
            if (!periodStart) {
                fdate = moment();
            } else {
                fdate = moment(periodStart);
                if (!fdate.isValid()) {
                    res.status(400);
                    return res.json({message: 'Invalid date format, should be ISO 8601'});
                }
            }

            return obtainPerformance(classReq, scale, fdate, req)
                .then(function(performance) {
                    return obtainUsers(classReq, req)
                        .then(function(allStudents) {
                            console.log(JSON.stringify(allStudents, null, 2));

                            for (var i = allStudents.students.length - 1; i >= 0; i--) {
                                var exid = getExternalId(allStudents.students[i]);
                                var student = { id: exid, username: allStudents.students[i].username, score: 0 };
                                var improvement = { id: exid, username: allStudents.students[i].username, score: 0 };

                                for (var j = performance.students.length - 1; j >= 0; j--) {
                                    if (allStudents.students[i].username === performance.students[j].student) {
                                        student.score = performance.students[j].score;

                                        for (var k = performance.previous.length - 1; k >= 0; k--) {
                                            if (performance.previous[k].student === performance.students[j].student) {
                                                var imp = student.score - performance.previous[k].score;
                                                improvement.score = imp > 0 ? imp : 0;
                                                performance.previous.splice(k, 1);
                                            }
                                        }

                                        performance.students.splice(j, 1);
                                        break;
                                    }
                                }

                                analysisresult.students.push(student);
                                analysisresult.improvement.push(improvement);
                            }

                            return analysisresult;
                        });
                });
        }), res);
});

var getExternalId = function(user) {
    for (var i = user.externalId.length - 1; i >= 0; i--) {
        if (user.externalId[i].domain === 'beaconing') {
            return user.externalId[i].id;
        }
    }
    return -1;
};

router.get('/performance/:classId', function (req, res) {

    var periodStart = req.query.periodStart;
    var scale = req.query.scale;
    var classId = req.params.classId;

    if (!classId) {
        res.status(400);
        return res.json({message: 'Invalid classId'});
    }

    if (!scale) {
        res.status(400);
        return res.json({message: 'Invalid time scale'});
    }
    if (scale !== 'year' && scale !== 'month' && scale !== 'week') {
        res.status(400);
        return res.json({message: 'Time scale should be: year, month or week.'});
    }

    var fdate;
    if (!periodStart) {
        fdate = moment();
    } else {
        fdate = moment(periodStart);
        if (!fdate.isValid()) {
            res.status(400);
            return res.json({message: 'Invalid date format, should be ISO 8601'});
        }
    }

    var analysisresult = {
        classId: classId,
        students: [
            {student: { id: 50, username: 'river' }, score: 0.9},
            {student: { id: 22, username: 'jocelynn' }, score: 0.8},
            {student: { id: 13, username: 'roman' }, score: 0.74},
            {student: { id: 98, username: 'gerardo' }, score: 0.7},
            {student: { id: 47, username: 'paxton' }, score: 0.67},
            {student: { id: 14, username: 'ishaan' }, score: 0.66},
            {student: { id: 67, username: 'landen' }, score: 0.63},
            {student: { id: 79, username: 'finley' }, score: 0.5},
            {student: { id: 50, username: 'gracie' }, score: 0.43},
            {student: { id: 7, username: 'arjun' }, score: 0.33},
            {student: { id: 72, username: 'eli' }, score: 0.28},
            {student: { id: 38, username: 'randy' }, score: 0.2}
        ],
        improvement: [
            {student: { id: 72, username: 'eli' }, score: 0.9},
            {student: { id: 14, username: 'ishaan' }, score: 0.8},
            {student: { id: 7, username: 'arjun' }, score: 0.8},
            {student: { id: 47, username: 'paxton' }, score: 0.6},
            {student: { id: 67, username: 'landen' }, score: 0.4},
            {student: { id: 50, username: 'gracie' }, score: 0.3},
            {student: { id: 98, username: 'gerardo' }, score: 0.2},
            {student: { id: 79, username: 'finley' }, score: 0.2},
            {student: { id: 38, username: 'randy' }, score: 0.2},
            {student: { id: 50, username: 'river' }, score: 0.1},
            {student: { id: 22, username: 'jocelynn' }, score: 0},
            {student: { id: 13, username: 'roman' }, score: 0}
        ],
        year: fdate.year()
    };

    if (scale === 'week') {
        analysisresult.week = fdate.week() + 1;
    }else if (scale === 'month') {
        analysisresult.month = fdate.month() + 1;
    }

    res.send(analysisresult);
});


var obtainPerformance = function(classe, scale, date, req) {
    var deferred = Q.defer();
    var year = date.year();
    var syear = date.year().toString();

    req.app.esClient.search({
        size: 200,
        from: 0,
        index: 'beaconing-performance',
        q: '_id:' + classe._id.toString()
    }, function (error, response) {
        if (error) {
            if (response.error && response.error.type === 'index_not_found_exception') {
                return deferred.resolve([]);
            }
            return deferred.reject(new Error(error));
        }

        var students = [], previous = [];
        if (response.hits && response.hits.hits.length) {
            if (response.hits.hits[0]._source[syear]) {
                if (scale === 'year') {
                    students = response.hits.hits[0]._source[syear].students;
                }else if (scale === 'month') {
                    var month = date.month();

                    // Obtain previous month
                    if (month - 1 >= 0 && response.hits.hits[0]._source[syear].months[(month - 1).toString()]) {
                        previous = response.hits.hits[0]._source[syear].months[(month - 1).toString()].students;
                    }else if (month - 1 < 0 && response.hits.hits[0]._source[(year - 1).toString()].months['11']) {
                        previous = response.hits.hits[0]._source[(year - 1).toString()].months['11'].students;
                    }

                    // Obtain current month
                    if (response.hits.hits[0]._source[syear].months[month.toString()]) {
                        students = response.hits.hits[0]._source[syear].months[month.toString()].students;
                    }

                }else if (scale === 'week') {
                    var week = date.week();

                    // Obtain previous week
                    if (week - 1 >= 0 && response.hits.hits[0]._source[syear].weeks[(week - 1).toString()]) {
                        previous = response.hits.hits[0]._source[syear].weeks[(week - 1).toString()].students;
                    }else if (week - 1 < 0 && response.hits.hits[0]._source[(year - 1).toString()].weeks['51']) {
                        previous = response.hits.hits[0]._source[(year - 1).toString()].weeks['51'].students;
                    }

                    // Obtain current month
                    if (response.hits.hits[0]._source[syear].weeks[week.toString()]) {
                        students = response.hits.hits[0]._source[syear].weeks[week.toString()].students;
                    }
                }
            }
        }

        deferred.resolve({current: students, previous: previous});
    });

    return deferred.promise;
};

var obtainUsers = function(classe, req) {
    var deferred = Q.defer();
    console.log('obtainUsers: starte');

    var query = [];
    for (var i = 0; i < classe.participants.students.length; i++) {
        console.log(classe.participants.students[i]);
        query.push({ username: classe.participants.students[i] });
    }
    query = {$or: query};

    console.log(JSON.stringify(query));

    authenticate(req.app.config)
        .then(function(token) {
            request({
                uri: req.app.config.a2.a2ApiPath + 'users?query=' + encodeURI(JSON.stringify(query)),
                method: 'GET',
                json: true,
                headers: {
                    Authorization: 'Bearer ' + token
                }
            }, function (err, httpResponse, body) {
                if (err || (httpResponse && httpResponse.statusCode !== 200)) {
                    console.log('obtainUsers: error');
                    return deferred.reject(body);
                }

                console.log('obtainUsers: success');
                deferred.resolve(body.data);
            });
        });

    return deferred.promise;
};

var authenticate = function(config) {
    var deferred = Q.defer();
    console.log('authenticate: start');

    request({
        uri: config.a2.a2ApiPath + 'login',
        method: 'POST',
        body: { username: config.a2.a2AdminUsername, password: config.a2.a2AdminPassword },
        json: true
    }, function (err, httpResponse, body) {
        if (err || (httpResponse && httpResponse.statusCode !== 200)) {
            console.log('authenticate: error');
            return deferred.reject(body);
        }

        console.log('authenticate: success');
        deferred.resolve(body.user.token);
    });

    return deferred.promise;
};


module.exports = router;
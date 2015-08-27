'use strict';

var sessions = require('../sessions');

var kafkaConsumer = function (kafkaConfig) {
    var kafka = require('../services/kafka')(kafkaConfig.uri);
    var players = require('../players');
    return {
        addTraces: function (playerId, versionId, gameplayId, data) {
            return sessions.find({
                versionId: sessions.toObjectID(versionId),
                end: null
            }, true).then(function (session) {
                if (!session) {
                    return true;
                }
                return players.findById(playerId)
                    .then(function(player) {
                        if(!player) {
                            return true;
                        }
                        if(!session.students || session.students.indexOf(player.name) === -1){
                            return true;
                        }
                        return kafka.send(session._id.toString(), data);
                    });
            });
        }
    };
};

module.exports = kafkaConsumer;
const Alexa = require('alexa-sdk');
const AWS = require('aws-sdk');

const docClient = new AWS.DynamoDB.DocumentClient({
    region: 'us-east-1'
});
exports.handler = function (event, context, callback) {
    //    var params = {
    //        Item: {
    //            name: 'test2',
    //            data: 'item'
    //        },
    //        TableName: 'test'
    //    }
    //    docClient.put(params, function (err, data) {
    //        callback(null, data);
    //    });
    var alexa = Alexa.handler(event, context);
    alexa.registerHandlers(handlers);
    alexa.execute();
};

var handlers = {
    'LaunchRequest': function () {
        this.emit(':ask', 'Hi! Welcome to Project Independence. Ask me to store the time!');
    },
    'TimeIntent': function () {
        var params = {
            Item: {
                name: 'Time',
                data: new Date().toString()
            },
            TableName: 'CignaDB'
        }
        var _this = this;
        docClient.put(params, function (err, data) {
            _this.emit(':ask', 'I put the current time into the database!', 'Done!');
            if (err) {
                console.log(err);
            } else if (data) {
                console.log(data);
            }

        });
    },
    'UnclearIntent': function () {
        this.emit(':ask', 'I did not understand that.');
    },
    'Unhandled': function () {
        this.emit(':ask', 'I dont understand.');
    }


};

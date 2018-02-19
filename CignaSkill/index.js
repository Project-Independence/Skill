const Alexa = require('alexa-sdk');
const AWS = require('aws-sdk');
const chrono = require('chrono-node');

const docClient = new AWS.DynamoDB.DocumentClient({
    region: 'us-east-1'
});
var sns = new AWS.SNS();
const states = {
    PROMPT: '_PROMPT'
};

// if thing is in list, add to quantity
// make removing

exports.handler = function (event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.registerHandlers(initialHandlers);
    alexa.dynamoDBTableName = 'Persistence';
    alexa.execute();
};

var currentEventKey = '';

const initialHandlers = {
    'LaunchRequest': function () {
        this.emit(':ask', 'Hi!');
    },
    'ShowShoppingList': function () {
        var _this = this;
        var responseString = '';
        var searchTest = this.event.request.intent.slots.literal.value;
        getShoppingList(function (err, data) {
            data.forEach(function (item) {
                responseString = responseString.concat(
                    '- ',
                    item.quantity,
                    ' ',
                    item.item,
                    '\n');
            });
            //            _this.response.cardRenderer('Shopping List', responseString);
            //            _this.response.speak("here is your shopping list");
            let date = chrono.parseDate(searchTest);
            let response = date ? date : 'there was no date';
            _this.response.cardRenderer('What you said', response);
            _this.response.speak(response);
            _this.emit(':responseReady');
        });
    },
    'RequestRide': function () {
        recordChange();
        var event = this.event.request.intent.slots.event.value;
        var date = this.event.request.intent.slots.date.value;
        var time = this.event.request.intent.slots.time.value;
        var _this = this;
        if (!event) {
            const slotToElicit = 'event'
            const speechOutput = 'Where to?'
            const repromptSpeech = 'Where are you going?'
            const updatedIntent = 'RequestRide'
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech)
        } else if (!date) {
            const slotToElicit = 'date'
            const speechOutput = 'What day?'
            const repromptSpeech = 'Please day me a time to be picked up'
            const updatedIntent = 'RequestRide'
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech)
        } else if (!time) {
            const slotToElicit = 'time'
            const speechOutput = 'What time would you like to be picked up?'
            const repromptSpeech = 'Please tell me a time to be picked up'
            const updatedIntent = 'RequestRide'
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech)
        } else {
            addRideRequest(event, date, time, function (err, data) {
                if (!err) {
                    const subject = "A Ride Was Requested";
                    const body = "A ride was requested for '" + event + "' on: " + date + " at " + time + ". You can claim it from the Caretaker Portal.";
                    //sendEmail(subject, body);

                    var outputSpeech = 'Signa requested a ride for ' + event + ' ' + date + ' at ' + time;
                    var outputText = 'Cigna requested a ride for "' + event + '" ' + date + ' at ' + time + '.';
                    _this.response.cardRenderer("Response", outputText);
                    _this.response.speak(outputSpeech);
                    _this.emit(':responseReady');
                } else {
                    _this.emit(':tell', 'There was a problem');
                }
            });
        }
    },
    'RequestErrand': function () {
        recordChange();
        var errand = this.event.request.intent.slots.errand.value;
        var _this = this;
        if (!errand) {
            const slotToElicit = 'errand'
            const speechOutput = 'What errand?'
            const repromptSpeech = 'What do you need?'
            const updatedIntent = 'RequestErrand'
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech)
        }
        addErrand(errand, function (err, data) {
            if (!err)
                _this.emit(':tell', 'Signa added ' + errand + ' to your errands');
            else
                _this.emit(':tell', 'There was a problem');

        });
    },
    'AddShoppingItem': function () {
        recordChange();
        var item = this.event.request.intent.slots.item.value;
        var quantity = this.event.request.intent.slots.quantity.value;

        if (item) {
            if (item.split(' ')[0] == 'for') {
                item = item.replace('for ', '');
                quantity = 4;
            }
            if (item.split(' ')[0] == 'a') {
                item = item.replace('a ', '');
                quantity = 1;
            }
        }

        if (!item) {
            const slotToElicit = 'item'
            const speechOutput = 'Can you repeat what you want to add?'
            const repromptSpeech = 'Can you repeat what you want to add?'
            const updatedIntent = 'AddShoppingItem'
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech)
        }

        if (!quantity) {
            const slotToElicit = 'quantity'
            const speechOutput = 'How many?'
            const repromptSpeech = 'How many?'
            const updatedIntent = 'AddShoppingItem'
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech)
        }

        if (!quantity) quantity = 1;
        var _this = this;
        addShoppingItem(item, quantity, function (err, data) {
            if (!err) {
                let outputSpeech = 'Signa added ' + quantity + ' ' + item + ' to your shopping list.';
                let outputText = 'Cigna added ' + quantity + ' ' + item + ' to your shopping list.';
                _this.response.cardRenderer("Response", outputText);
                _this.response.speak(outputSpeech);
                _this.emit(':responseReady');
            } else
                _this.emit(':tell', 'There was a problem');
        });
    },
    'RemoveShoppingItem': function () {},
    'ClearShoppingList': function () {
        var _this = this;
        clearShoppingList(function () {
            _this.emit(':tell', 'Ok, I cleared it!');
        })
    },
    'PutCalendarEvent': function () {},
    'DeleteCalendarEvent': function () {},
    'UnclearIntent': function () {
        this.emit(':ask', '');
    },
    'Unhandled': function () {
        this.emit(':ask', '');
    },
    "AMAZON.StopIntent": function (intent, session, response) {
        var speechOutput = "Goodbye";
        response.tell(speechOutput);
    }
};

function addShoppingItem(item, quantity, callbackFn) {

    var params = {
        Key: {
            item: item
        },
        AttributeUpdates: {
            quantity: {
                Action: 'PUT',
                Value: quantity
            },
            timestamp: {
                Action: 'PUT',
                Value: Date.now()
            }
        },
        TableName: 'Shopping'
    }
    docClient.update(params, function (err, data) {
        if (typeof (callbackFn) == 'function') {
            console.log(err);
            callbackFn(err, data);
        }
    });
}

function clearShoppingList(callbackFn) {

}


function addRideRequest(event, date, time, callbackFn) {
    var params = {
        Key: {
            id: event + '_' + date
        },
        AttributeUpdates: {
            event: {
                Action: 'PUT',
                Value: event
            },
            date: {
                Action: 'PUT',
                Value: date
            },
            time: {
                Action: 'PUT',
                Value: time
            },
            claimed: {
                Action: 'PUT',
                Value: false
            }
        },
        TableName: 'Rides'
    }
    if (!time) {
        params.AttributeUpdates.time.Value = 'N/A';
    }
    docClient.update(params, function (err, data) {
        if (typeof (callbackFn) == 'function') {
            console.log(err);
            callbackFn(err, data);
        }
    });
}

function addPrescriptionRequest(prescription, date, time) {

}

function sendEmail(subject, body) {
    var params = {
        Message: body,
        Subject: subject,
        TopicArn: 'arn:aws:sns:us-east-1:112632085303:CaretakerPortal'
    };
    sns.publish(params, function (err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else console.log(data); // successful response
    });
}

function addErrand(errand, callbackFn) {
    var params = {
        Key: {
            id: errand
        },
        AttributeUpdates: {
            task: {
                Action: 'PUT',
                Value: errand
            },
            timestamp: {
                Action: 'PUT',
                Value: Date.now()
            }
        },
        TableName: 'Errands'
    }
    docClient.update(params, function (err, data) {
        if (typeof (callbackFn) == 'function') {
            console.log(err);
            callbackFn(err, data);
        }
    });
}

function recordChange(callbackFn) {
    var params = {
        Key: {
            id: 'lastChange'
        },
        AttributeUpdates: {
            time: {
                Action: 'PUT',
                Value: Date.now()
            }
        },
        TableName: 'UIData'
    }
    docClient.update(params, function (err, data) {
        if (typeof (callbackFn) == 'function') {
            console.log(err);
            callbackFn(err, data);
        }
    });
}

function getShoppingList(callbackFn) {
    var params = {
        TableName: 'Shopping'
    }
    docClient.scan(params, function (err, data) {
        if (typeof (callbackFn) == 'function') {
            console.log(err);
            var shoppingList = [];
            data.Items.forEach((item) => {
                shoppingList.push(item);
            });
            shoppingList.sort(function (a, b) {
                var keyA = a.timestamp,
                    keyB = b.timestamp;
                if (keyA < keyB) return 1;
                if (keyA > keyB) return -1;
                return 0;
            });
            callbackFn(err, shoppingList);
        }
    });
}

//const initialHandlers = {
//    'AMAZON.SearchAction<object@WeatherForecast>': function () {
//        this.emit(':ask', 'No idea. Probably cold.')
//    },
//    'LaunchRequest': function () {
//        this.emit(':ask', 'Hi! Welcome to Project Independence. Ask mef to store the time!');
//    },
//    'calenderIntent': function () {
//        var inputTime = this.event.request.intent.slots.date.value;
//        var inputContents = this.event.request.intent.slots.event.value;
//        var id = inputTime + ' ' + inputContents;
//
//        var _this = this;
//        storeData('currentEvent', id, function () {
//            dbPut('Events', id, 'desc', inputContents, function (err, data) {
//                dbPut('Events', id, 'time', inputTime, function (err, data) {
//                    if (!err) {
//                        _this.emit(':ask', 'I put ' + inputContents + ' into your calender ' + inputTime + '! Will you need a ride?');
//                    } else {
//                        _this.emit(':ask', 'There was an issue connecting to the cloud');
//                    }
//                });
//            });
//            _this.handler.state = states.PROMPT;
//        });
//    },
//    'UnclearIntent': function () {
//        this.emit(':ask', 'I did not understand that.');
//    },
//    'Unhandled': function () {
//        this.emit(':ask', 'I dont understand.');
//    }
//};
//
//const rideHandlers = Alexa.CreateStateHandler(states.PROMPT, {
//    'YesRideIntent': function (session) {
//        var _this = this;
//        getData(function (data) {
//            dbPut('Events', data.currentEvent, 'rideNeeded', 'yes', function () {
//                dbPut('Events', data.currentEvent, 'driver', 'unassigned', function () {
//                    _this.emit(':ask', 'Okay, I will let somebody know!');
//                });
//            });
//        });
//    },
//    'NoRideIntent': function () {
//        var _this = this;
//        getData(function (data) {
//            dbPut('Events', data.currentEvent, 'rideNeeded', 'no', function () {
//                dbPut('Events', data.currentEvent, 'driver', 'N/A', function () {
//                    _this.emit(':ask', 'Okay.');
//                });
//            });
//        });
//    },
//    'Unhandled': function () {
//        this.emit(':ask', 'I dont understand.');
//    }
//});
//
//function dbPut(table, id, key, contents, callbackFn) {
//    var params = {
//        Key: {
//            id: id
//        },
//        AttributeUpdates: {},
//        TableName: table
//    };
//    params.AttributeUpdates[key] = {
//        Action: 'PUT',
//        Value: contents
//    }
//    docClient.update(params, function (err, data) {
//        if (typeof (callbackFn) == 'function') {
//            console.log(err);
//            callbackFn(err, data);
//        }
//    });
//}
//
//function storeData(key, contents, callbackFn) {
//    getData(function (data) {
//        data[key] = contents;
//        var params = {
//            Item: {
//                id: 'main',
//                data: JSON.stringify(data)
//            },
//            TableName: 'SkillData'
//        }
//        docClient.put(params, function (err, data) {
//            if (typeof (callbackFn) == 'function') {
//                callbackFn(err, data);
//            }
//        });
//    });
//}
//
//function getData(callbackFn) {
//    var params = {
//        Key: {
//            id: 'main'
//        },
//        TableName: 'SkillData'
//    }
//    docClient.get(params, function (err, data) {
//        if (typeof (callbackFn) == 'function') {
//            callbackFn(JSON.parse(data.Item.data));
//        }
//    });
//}

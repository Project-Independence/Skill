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

const names = ['Lucas', 'Hamza', 'Jd', 'Bing'];

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
    'SendMessage': function () {
        var message = this.event.request.intent.slots.message.value;
        if (!message) {
            const slotToElicit = 'message';
            const speechOutput = 'what message do you want to send?';
            const repromptSpeech = 'what do you want to say?';
            const updatedIntent = 'SendMessage';
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
        } else {
            this.response.speak('Sending ' + message);
            this.emit(':responseReady');
            this.response.cardRenderer('Sending...', message);
        }
    },
    'ShowShoppingList': function () {
        var _this = this;
        var responseString = '';
        // var searchTest = this.event.request.intent.slots.literal.value;
        getShoppingList(function (err, data) {
            data.forEach(function (item) {
                responseString = responseString.concat(
                    '- ',
                    item.quantity,
                    ' ',
                    item.item,
                    '\n');
            });
            _this.response.cardRenderer('Shopping List:', responseString);
            _this.response.speak("here is your shopping list");
            let response = 'Here is your shopping list';
            _this.response.cardRenderer('Shopping List:', responseString);
            //            let date = chrono.parseDate(searchTest);
            //            let response = date ? date : 'there was no date';
            //            _this.response.cardRenderer('What you said', response);
            _this.response.speak(response);
            _this.emit(':responseReady');
        });
    },
    'GetEvents': function () {
        let _this = this;
        var speechText = this.event.request.intent.slots.date.value;
        let date = chrono.parseDate(speechText).toLocaleDateString();
        let responseText = '';
        let showText = '';
        getEvents(date, function (data) {
            if (data.length > 0) {
                responseText += 'You have ' + data.length + ' event' + (data.length == 1 ? '' : 's') + '. ';
                data.forEach(function (event) {
                    if (event.claimed == true) {
                        let driver = names[event.ClientID];
                        responseText += 'Lucas' + ' is giving you a ride to "' + event.event + '", ';
                        showText += 'Name: ' + event.event +
                            '\n' + 'Transportation: ' + 'Lucas' +
                            '\n\n';
                    } else {
                        showText += 'Name: ' + event.event +
                            '\n' + 'Transportation: Requested\n\n';
                        responseText += 'you need a ride to "' + event.event + '", ';
                    }
                })
                _this.response.speak(responseText);
                _this.response.cardRenderer('Events on ' + date + ':', showText);
                _this.emit(':responseReady');
            } else {
                _this.response.speak('You have no events ' + date);
                _this.response.cardRenderer("Events on " + date, 'You have no events ' + date + '.');
                _this.emit(':responseReady');
            }
        })
    },
    'RequestRide': function () {
        var speechText = this.event.request.intent.slots.event.value;
        if (speechText) {
            let date = chrono.parseDate(speechText);
            if (removeDate(speechText) != '') {
                let event = removeDate(speechText);
                event = event.replace('for ', '');
                event = event.replace('to ', '');
                this.attributes['event_slot'] = event;
            }
            if (chrono.parseDate(speechText)) {
                if (this.attributes['date_slot'] == 'N/A') {
                    this.attributes['date_slot'] = date.toLocaleDateString();
                }
                if (this.attributes['time_slot'] == 'N/A') {
                    let _this = this;
                    chrono.parse(speechText).forEach(function (result) {
                        if (result.tags.ENTimeExpressionParser) {
                            _this.attributes['time_slot'] = date.toLocaleTimeString();
                        }
                    });
                }
            }
        }
        if (this.attributes['event_slot'] == 'N/A') {
            const slotToElicit = 'event';
            const speechOutput = 'where to?';
            const repromptSpeech = 'whats the ride for?';
            const updatedIntent = 'RequestRide';
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
        } else if (this.attributes['date_slot'] == 'N/A') {
            const slotToElicit = 'event';
            const speechOutput = 'what day?';
            const repromptSpeech = 'tell me a day';
            const updatedIntent = 'RequestRide';
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
        } else if (this.attributes['time_slot'] == 'N/A') {
            const slotToElicit = 'event';
            const speechOutput = 'what time would you like to be picked up?';
            const repromptSpeech = 'what time?';
            const updatedIntent = 'RequestRide';
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
        } else {
            let event = this.attributes['event_slot'];
            let date = this.attributes['date_slot'];
            let time = this.attributes['time_slot'];

            let rideText = event + ' ' + date + ' at ' + time;
            this.response.speak('Requested a ride for ' + rideText);

            let showText = 'Event: ' + event + '\nDate: ' + date + '\nPickup Time: ' + time;
            // this.response.cardRenderer("Requested a ride: ", showText);
            this.attributes['event_slot'] = 'N/A';
            this.attributes['date_slot'] = 'N/A';
            this.attributes['time_slot'] = 'N/A';

            let _this = this;
            logRideRequest(event, date, time, function () {
                return _this.emit(':responseReady');
            });

            var http = require('http');

            var post_options = {
                host: 'fcm.googleapis.com',
                path: '/fcm/send',
                method: 'POST',
                'headers': {
                    'Authorization': 'key=' + 'AAAAYwFKIfU:APA91bFzDV9FFpKuIYVm16e5hUsq1oSDJBMENmI1T93ISv1h-JR4YvpLUnyroYjP0zTuMJ11aU_fVtsKXgpXtF3KGv58X8FwSziSxfBSmgiSoyV9rTdtH4SadiPe0xOPF1ZMxAs_S4KX',
                    'Content-Type': 'application/json'
                },
            }
            var post_data = JSON.stringify({
                'notification': {
                    'title': 'New Request',
                    'body': 'Barbara requested a ride to ' + event + ' on ' + date + ' at ' + time,
                    'icon': 'https://2rggqq2i39ev11stft2k5mo0-wpengine.netdna-ssl.com/wp-content/uploads/cigna-square-logo-2-300x300.png',
                    'click_action': 'http://localhost:8080'
                },
                'to': 'fI2-6s8gELk:APA91bG_Wdlgs20ffL50BHFTXIgtJcC5JBpR0Wy_R3x3p12Sv5RaVNr6HLogmYR-DLNIgsPr2VsHprRI4or-IZiaZGGp3ip4r8xO25r2ghRhL2SxgOjISFLgWGN5kvLsG-aVIRbWasSe'
            })
            // Set up the request
            var post_req = http.request(post_options, function (res) {});

            // post the data
            post_req.write(post_data);
            post_req.end();
            recordChange();
        }
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

function removeDate(string) {
    let parsedResult = chrono.parse(string);
    parsedResult.forEach(function (result) {
        string = string.replace('on ' + result.text, '');
        string = string.replace('at ' + result.text, '');
        string = string.replace('for ' + result.text, '');
        string = string.replace(result.text, '');
    });
    return string;
}

function getEvents(date, callbackFn) {
    let params = {
        TableName: 'Rides'
    };
    let events = [];
    docClient.scan(params, (err, data) => {
        data.Items.forEach(function (event) {
            console.log(event);
            if (event.date == date) {
                events.push(event);
            }
        });
        callbackFn(events);
    });
}

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


function logRideRequest(event, date, time, callbackFn) {
    var params = {
        Key: {
            id: date + time
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

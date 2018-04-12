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
        var _this = this;
        if (!message) {
            const slotToElicit = 'message';
            const speechOutput = 'what message do you want to send?';
            const repromptSpeech = 'what do you want to say?';
            const updatedIntent = 'SendMessage';
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
        } else {
            this.attributes['current_message'] = message;
            displayCaretakers(this, 'Who would you like to send this to?');
            //            message = message.charAt(0).toUpperCase() + message.slice(1);
            //            sendNotification('New Message', message);
            //
            //            // delay to ensure notification sends (doesn't have callback)
            //            setTimeout(function () {
            //                displayMessage(_this, message);
            //            }, 500);
        }
    },
    'ElementSelected': function () {
        let type = this.event.request.token.split('-')[0];
        if (type === 'shoppingItem') {
            let item = this.event.request.token.split('-')[1];
            this.attributes['selected_item'] = item;
            this.response.speak('would you like to edit or remove ' + item + '?');
            this.response.listen('would you like to edit or remove ' + item + '?');
            this.response.shouldEndSession = false;
            this.emit(':responseReady');
        } else if (type === 'caretaker') {
            let caretakerID = this.event.request.token.split('-')[1];
            message = this.attributes['current_message'];
            message = message.charAt(0).toUpperCase() + message.slice(1);
            sendNotification('New Message', message);
            // delay to ensure notification sends (doesn't have callback)
            let _this = this;
            setTimeout(function () {
                sendMessage(message, caretakerID, function () {
                    displayMessage(_this, message);
                });
            }, 500);
        }
    },
    'ModifyShoppingItem': function () {
        let oldItem = this.attributes['selected_item'];
        let newItem = this.event.request.intent.slots.newItem.value;
        let _this = this;
        if (!newItem) {
            const slotToElicit = 'newItem';
            const speechOutput = 'what would you like to change it to?';
            const repromptSpeech = 'what would you like to change it to?';
            const updatedIntent = 'ModifyShoppingItem';
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
        } else {
            changeShoppingItem(oldItem, newItem, function () {
                displayShoppingList(_this, 'I changed ' + oldItem + ' to ' + newItem);
            });
        }
    },
    'RemoveShoppingItem': function () {
        let item = this.attributes['selected_item'];
        let _this = this;
        removeShoppingItem(item, function () {
            displayShoppingList(_this, 'I removed ' + item + ' from your shopping list.');
        });
    },
    'ShowShoppingList': function () {
        let _this = this;
        displayShoppingList(this, "Here is your shopping list");
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
            if (removeDate(speechText) != '' && this.attributes['event_slot'] == 'N/A') {
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

            sendNotification('New Ride Request', 'Barbara requested a ride to ' + event + ' on ' + date + ' at ' + time)
            recordChange();
        }
    },
    'AddShoppingItem': function () {
        recordChange();
        var item = this.event.request.intent.slots.item.value;
        var quantity = this.event.request.intent.slots.quantity.value;

        if (!item) {
            const slotToElicit = 'item'
            const speechOutput = 'Can you repeat what you want to add?'
            const repromptSpeech = 'Can you repeat what you want to add?'
            const updatedIntent = 'AddShoppingItem'
            return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech)
        }

        var _this = this;
        addShoppingItem(item, function (err, data) {
            if (!err) {
                displayShoppingList(_this, 'I added ' + item + ' to your shopping list.');
            } else
                _this.emit(':tell', 'There was a problem');
        });
    },
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

function sendNotification(title, body) {
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
            'title': title,
            'body': body,
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
}

function displayMessage(intent, message) {
    var response = {
        "version": "1.0",
        "response": {
            "directives": [
                {
                    "type": "Display.RenderTemplate",
                    "template": {
                        "type": "BodyTemplate3",
                        "token": "string",
                        "backButton": "VISIBLE",
                        "image": {
                            "sources": [{
                                "url": "http://flaticons.net/icons/Mobile%20Application/Send.png"
                        }]
                        },
                        "title": "Sending...",
                        "textContent": {
                            "primaryText": {
                                "text": message,
                                "type": "RichText"
                            },
                            //                            "secondaryText": {
                            //                                "text": message,
                            //                                "type": "PlainText"
                            //                            },
                            //                            "tertiaryText": {
                            //                                "text": message,
                            //                                "type": "PlainText"
                            //                            }

                        }
                    }
                    }],
            "outputSpeech": {
                "type": "SSML",
                "ssml": "<speak> Sending the message " + message + "</speak>"
            },
            "shouldEndSession": true
        },
        "sessionAttributes": intent.attributes
    }


    intent.emit('ShowShoppingList');
    intent.context.succeed(response);
}

function displayCaretakers(intent, speechText, message) {
    getCaretakers(function (err, data) {
        if (data.length > 0) {
            var response = {
                "version": "1.0",
                "response": {
                    "directives": [
                        {
                            "type": "Display.RenderTemplate",
                            "template": {
                                "type": "ListTemplate1",
                                "token": "string",
                                "backButton": "VISIBLE",
                                "title": "Who would you like to send this message to?",
                                "listItems": [
                                    {
                                        "token": 'caretaker-' + 0,
                                        "textContent": {
                                            "primaryText": {
                                                "text": 'Everyone',
                                                "type": "PlainText"
                                            },
                                        }
                                    }
                                ]
                            }
                    }],
                    "outputSpeech": {
                        "type": "SSML",
                        "ssml": "<speak>" + speechText + "</speak>"
                    },
                    "shouldEndSession": false
                },
                "sessionAttributes": intent.attributes
            }
            data.forEach(function (item) {
                let listItem = {
                    "token": 'caretaker-' + item.UserID,
                    "textContent": {
                        "primaryText": {
                            "text": item.FirstName + ' ' + item.LastName,
                            "type": "PlainText"
                        },
                        "secondaryText": {
                            "text": item.Relationship,
                            "type": "PlainText"
                        }
                    }
                }
                response.response.directives[0].template.listItems.push(listItem)
            });

            intent.context.succeed(response);
        }
    });
}

function displayShoppingList(intent, speechText) {
    getShoppingList(function (err, data) {
        if (data.length > 0) {
            var response = {
                "version": "1.0",
                "response": {
                    "directives": [
                        {
                            "type": "Display.RenderTemplate",
                            "template": {
                                "type": "ListTemplate1",
                                "token": "string",
                                "backButton": "VISIBLE",
                                "title": "Shopping List",
                                "listItems": [],
                                //                                "backgroundImage": {
                                //                                    "contentDescription": "string",
                                //                                    "sources": [
                                //                                        {
                                //                                            "url": "https://www.publicdomainpictures.net/pictures/80000/velka/old-paper-1391971316LSF.jpg",
                                //                                  },
                                //
                                //                                ]
                                //                                }
                            }
                    }],
                    "outputSpeech": {
                        "type": "SSML",
                        "ssml": "<speak>" + speechText + "</speak>"
                    },
                    "shouldEndSession": false
                },
                "sessionAttributes": intent.attributes
            }


            data.forEach(function (item) {
                let listItem = {
                    "token": 'shoppingItem-' + item.item,
                    "textContent": {
                        "primaryText": {
                            "text": item.item,
                            "type": "PlainText"
                        }
                    }
                }
                if (item.done) {
                    listItem["image"] = {
                        "sources": [{
                            //"url": "./assets/in_delivery_icon.png"
                            "url": "http://flaticons.net/icons/Shopping/Add-To-Cart.png"
                        }]
                    }
                    listItem["textContent"]["secondaryText"] = {
                        "text": "Picked up by " + item.caretakerName,
                        "type": "RichText"
                    }
                } else {
                    listItem["image"] = {
                        "sources": [{
                            //"url": "./assets/in_delivery_icon.png"
                            "url": "http://www.iconsplace.com/download/white-car-512.png"
                        }]
                    }
                    listItem["textContent"]["tertiaryText"] = {
                        "text": "In Progress",
                        "type": "RichText"
                    }
                }
                response.response.directives[0].template.listItems.push(listItem)
            });

            intent.context.succeed(response);
        }
    });

}

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

function getCaretakers(callbackFn) {
    let params = {
        TableName: 'Caretaker'
    };
    docClient.scan(params, (err, data) => {
        callbackFn(err, data.Items);
    });
}

function sendMessage(message, caretakerID, callbackFn) {
    var params = {
        Key: {
            MessageID: Date.now().toString()
        },
        AttributeUpdates: {
            timestamp: {
                Action: 'PUT',
                Value: Date.now()
            },
            CaretakerID: {
                Action: 'PUT',
                Value: caretakerID
            },
            Message: {
                Action: 'PUT',
                Value: message
            }
        },
        TableName: 'Message'
    }
    docClient.update(params, function (err, data) {
        if (typeof (callbackFn) == 'function') {
            console.log(err);
            callbackFn(err, data);
        }
    });
}

function addShoppingItem(item, callbackFn) {
    var params = {
        Key: {
            item: item
        },
        AttributeUpdates: {
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

function removeShoppingItem(item, callbackFn) {
    var params = {
        Key: {
            item: item
        },
        TableName: 'Shopping'
    }
    docClient.delete(params, function (err, data) {
        if (typeof (callbackFn) == 'function') {
            console.log(err);
            callbackFn(err, data);
        }
    });
}

function changeShoppingItem(oldItem, newItem, callbackFn) {
    removeShoppingItem(oldItem, function () {
        addShoppingItem(newItem, function () {
            callbackFn();
        })
    })
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

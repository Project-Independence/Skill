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

// init persistence table for data to persist between sessions
exports.handler = function (event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.registerHandlers(initialHandlers);
    alexa.dynamoDBTableName = 'Persistence';
    alexa.execute();
};

var currentEventKey = '';


// INTENT HANDLERS -- see AWS portal to see definitions and descriptions 
const initialHandlers = {
    // handler activated on launch (we dont use this)
    'LaunchRequest': function () {
        this.emit(':ask', 'Hi!');
    },
    // messag sending handler
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
            if (this.attributes['reply_id'] != -1) {
                let caretakerID = this.attributes['reply_id'];
                message = this.attributes['current_message'];
                message = message.charAt(0).toUpperCase() + message.slice(1);
                sendNotification('New Message', [caretakerID], message);
                getCaretakerName(caretakerID, function (name) {
                    if (caretakerID == 0) {
                        name = 'Everyone';
                    }
                    sendMessage(message, caretakerID, function () {
                        _this.attributes['reply_id'] = -1;
                        displayMessage(_this, message, name);
                    });
                })
            } else {
                displayCaretakers(this, 'Who would you like to send this to?');
            }
        }
    },
    // passed caretaker name to send message to
    "SelectCaretaker": function () {
        let caretakerName = this.event.request.intent.slots.caretakerName.value;
        let _this = this;
        getCaretakerByName(caretakerName, function (id) {
            if (id != -1) {
                let caretakerID = id;
                message = _this.attributes['current_message'];
                message = message.charAt(0).toUpperCase() + message.slice(1);
                sendNotification('New Message', [caretakerID], message);
                // delay to ensure notification sends (doesn't have callback)
                setTimeout(function () {
                    sendMessage(message, caretakerID, function () {
                        displayMessage(_this, message, caretakerName);
                    });
                }, 500);
            } else {
                displayCaretakers(_this, 'I could not find ' + caretakerName + ', try selecting from the on screen list.')
            }
        })
    },
    // selection handler for lists
    'ElementSelected': function () {
        let type = this.event.request.token.split('-')[0];
        if (type === 'shoppingItem') {
            let item = this.event.request.token.split('-')[1];
            this.attributes['selected_item'] = item;
            this.response.speak('would you like to edit or remove ' + item + '?');
            this.response.listen('would you like to edit or remove ' + item + '?');
            this.response.shouldEndSession = false;
            this.emit(':responseReady');
        }
        if (type === 'caretaker') {
            let caretakerID = parseInt(this.event.request.token.split('-')[1]);
            message = this.attributes['current_message'];
            message = message.charAt(0).toUpperCase() + message.slice(1);
            sendNotification('New Message', [caretakerID], message);
            let _this = this;
            getCaretakerName(caretakerID, function (name) {
                if (caretakerID == 0) {
                    name = 'Everyone';
                }
                sendMessage(message, caretakerID, function () {
                    displayMessage(_this, message, name);
                });
            })
        }
        if (type === 'message') {
            let fields = this.event.request.token.split('-');
            let caretakerID = parseInt(fields[1]);
            this.attributes['reply_id'] = caretakerID;
            let caretakerName = fields[2];
            let message = fields[3];
            this.response.speak(caretakerName + ' sent you, ' + message + '. If you would like to message back, say reply to message');
            this.response.listen('If you would like to message back, say reply to message');
            this.response.shouldEndSession = false;
            this.emit(':responseReady');
        }
        if (type === 'shoppingPickup') {
            let fields = this.event.request.token.split('-');
            let caretakerName = fields[2];
            let item = fields[1];
            this.response.speak(caretakerName + ' picked up ' + item + ' for you.');
            this.response.shouldEndSession = false;
            this.emit(':responseReady');
        }
        if (type === 'rideClaim') {
            let fields = this.event.request.token.split('-');
            let dest = fields[1];
            let caretakerName = fields[2];
            let date = fields[3];
            this.response.speak(caretakerName + ' claimed your ride for ' + dest + ' on ' + date);
            this.response.shouldEndSession = false;
            this.emit(':responseReady');
        }
        if (type === 'rideUnclaim') {
            let fields = this.event.request.token.split('-');
            let dest = fields[1];
            let caretakerName = fields[2];
            let date = fields[3];
            this.response.speak(caretakerName + ' can no longer provide a ride for ' + dest + ' on ' + date);
            this.response.shouldEndSession = false;
            this.emit(':responseReady');
        }
    },
    // change shopping item text
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
                recordChange();
            });
        }
    },
    // delete shopping item
    'RemoveShoppingItem': function () {
        let item = this.attributes['selected_item'];
        let _this = this;
        removeShoppingItem(item, function () {
            displayShoppingList(_this, 'I removed ' + item + ' from your shopping list.');
            recordChange();
        });
    },
    // display all shopping items
    'ShowShoppingList': function () {
        let _this = this;
        displayShoppingList(this, "Here is your shopping list");
    },
    // get and display notifications
    'GetNotifications': function () {
        let _this = this;
        displayActivities(this, "Here is your shopping list");
    },
    // get and display events (rides)
    'GetEvents': function () {
        let _this = this;
        getEvents(function (err, data) {
            if (data.length > 0) {
                displayEvents(_this, "Here are your upcoming events");
            } else {
                _this.response.speak('You have no events ' + date);
                _this.response.cardRenderer("Events on " + date, 'You have no events ' + date + '.');
                _this.emit(':responseReady');
            }
        })
    },
    // parse text for date / time / event and request ride
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
                    this.attributes['date_slot'] = date;
                }
                if (this.attributes['time_slot'] == 'N/A') {
                    let _this = this;
                    chrono.parse(speechText).forEach(function (result) {
                        if (result.tags.ENTimeExpressionParser) {
                            _this.attributes['time_slot'] = date;
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
            let date = new Date(this.attributes['date_slot']);
            let time = new Date(this.attributes['time_slot']);

            let rideText = event + ' ' + date.toLocaleDateString() + ' at ' + time.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
            this.response.speak('Requested a ride for, ' + rideText);

            let showText = 'Event: ' + event + '\nDate: ' + date + '\nPickup Time: ' + time;
            // this.response.cardRenderer("Requested a ride: ", showText);
            this.attributes['event_slot'] = 'N/A';
            this.attributes['date_slot'] = 'N/A';
            this.attributes['time_slot'] = 'N/A';

            let _this = this;
            logRideRequest(event, date, time, function () {
                return _this.emit(':responseReady');
            });

            event = event.replace(/\b\w/g, l => l.toUpperCase());
            sendNotification('Ride Request', [], 'Barbara requested a ride to ' + event + ' on ' + date.toLocaleDateString() + ' at ' + time.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            }));
            recordChange();
        }
    },
    // add shopping item
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

        item = item.replace(/\b\w/g, l => l.toUpperCase());
        var _this = this;
        addShoppingItem(item, function (err, data) {
            if (!err) {
                displayShoppingList(_this, 'I added ' + item + ' to your shopping list.');
            } else
                _this.emit(':tell', 'There was a problem');
        });
    },
    // skill unsure which intent you meant 
    'UnclearIntent': function () {
        this.emit(':ask', '');
    },
    // intent not handled in current state
    'Unhandled': function () {
        this.emit(':ask', '');
    },
    // "stop" "cancel" etc
    "AMAZON.StopIntent": function (intent, session, response) {
        var speechOutput = "Goodbye";
        response.tell(speechOutput);
    }
};

// HELPER FUNCTIONS

// displayer upcoming events
function displayEvents(intent, speechText) {
    getEvents(function (err, data) {
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
                                "title": "Events",
                                "listItems": [],
                                "backgroundImage": {
                                    "contentDescription": "string",
                                    "sources": [
                                        {
                                            "url": "https://images.template.net/wp-content/uploads/2015/04/Patterns-Black-Textures-Grunge.jpg",
                                                                  },

                                                                ]
                                }
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
                let listItem = {}
                if (item.claimed) {
                    listItem = {
                        "token": 'event-' + item.UserID,
                        "textContent": {
                            "primaryText": {
                                "text": item.event,
                                "type": "PlainText"
                            },
                            "secondaryText": {
                                "text": item.time + ', ' + item.driverName + ' is giving you a ride.',
                                "type": "PlainText"
                            },
                            "tertiaryText": {
                                "text": item.date,
                                "type": "PlainText"
                            }
                        }
                    }
                } else {
                    listItem = {
                        "token": 'event-' + item.UserID,
                        "textContent": {
                            "primaryText": {
                                "text": item.event,
                                "type": "PlainText"
                            },
                            "secondaryText": {
                                "text": item.time,
                                "type": "PlainText"
                            },
                            "tertiaryText": {
                                "text": item.date,
                                "type": "PlainText"
                            }
                        }
                    }
                }
                response.response.directives[0].template.listItems.push(listItem)
            });

            intent.context.succeed(response);
        }
    });
}

// send notification to caretaker
function sendNotification(title, ids, body) {
    console.log(ids);
    getTokens(ids, function (tokens) {
        console.log(tokens);
        tokens.forEach(function (id) {
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
                'to': id
            })
            // Set up the request
            var post_req = http.request(post_options, function (res) {});

            // post the data
            post_req.write(post_data);
            post_req.end();
        });
    });
}

// get firebase tokens for notifications
function getTokens(idArray, callbackFn) {
    let tokens = [];
    getCaretakers(function (err, data) {
        data.forEach(function (caretaker) {
            if ((caretaker.FirebaseToken) && (idArray.length == 0 || idArray.includes(caretaker.UserID))) {
                tokens.push(caretaker.FirebaseToken);
            }
        });
        callbackFn(tokens);
    });
}

// get name of caretaker by id
function getCaretakerName(id, callbackFn) {
    var params = {
        TableName: 'Caretaker',
        Key: {
            UserID: id
        }
    };

    docClient.get(params, function (err, data) {
        if (err) console.log(err);
        else callbackFn(data.Item.FirstName);
    });
}

// display ride info on show
function displayRide(intent, event, date, time) {
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
                        "title": "Sending to " + caretakerName + "...",
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

                        },
                        "backgroundImage": {
                            "contentDescription": "string",
                            "sources": [
                                {
                                    "url": "https://images.template.net/wp-content/uploads/2015/04/Patterns-Black-Textures-Grunge.jpg",
                                                                  },

                                                                ]
                        }
                    }
                    }],
            "outputSpeech": {
                "type": "SSML",
                "ssml": "<speak> Sending the message " + message + " to " + caretakerName + "</speak>"
            },
            "shouldEndSession": true
        },
        "sessionAttributes": intent.attributes
    }


    intent.emit('ShowShoppingList');
    intent.context.succeed(response);
}

// display message on show
function displayMessage(intent, message, caretakerName) {
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
                        "title": "Sending to " + caretakerName + "...",
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

                        },
                        "backgroundImage": {
                            "contentDescription": "string",
                            "sources": [
                                {
                                    "url": "https://images.template.net/wp-content/uploads/2015/04/Patterns-Black-Textures-Grunge.jpg",
                                                                  },

                                                                ]
                        }
                    }
                    }],
            "outputSpeech": {
                "type": "SSML",
                "ssml": "<speak> Sending the message " + message + " to " + caretakerName + "</speak>"
            },
            "shouldEndSession": true
        },
        "sessionAttributes": intent.attributes
    }


    intent.emit('ShowShoppingList');
    intent.context.succeed(response);
}


// get caretaker object by name
function getCaretakerByName(name, callbackFn) {
    if (name === 'everyone' || name === 'Everyone') {
        callbackFn(0);
    } else {
        let found = false;
        getCaretakers(function (err, data) {
            data.forEach(function (caretaker) {
                if (caretaker.FirstName == name) {
                    callbackFn(caretaker.UserID);
                    found = true;
                }
            })
            if (!found) callbackFn(-1);
        })
    }
}

// display all caretakers on show
function displayCaretakers(intent, speechText) {
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
                                ],
                                "backgroundImage": {
                                    "contentDescription": "string",
                                    "sources": [
                                        {
                                            "url": "https://images.template.net/wp-content/uploads/2015/04/Patterns-Black-Textures-Grunge.jpg",
                                                                  },

                                                                ]
                                }
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

// display shopping list on show
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
                                "backgroundImage": {
                                    "contentDescription": "string",
                                    "sources": [
                                        {
                                            "url": "https://images.template.net/wp-content/uploads/2015/04/Patterns-Black-Textures-Grunge.jpg",
                                                                  },

                                                                ]
                                }
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

// display activities on show
function displayActivities(intent, speechText) {
    getActivities(function (err, data) {
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
                                "title": "Notifications",
                                "listItems": [],
                                "backgroundImage": {
                                    "contentDescription": "string",
                                    "sources": [
                                        {
                                            "url": "https://images.template.net/wp-content/uploads/2015/04/Patterns-Black-Textures-Grunge.jpg",
                                                                  },

                                                                ]
                                }
                            }
                    }],
                    "outputSpeech": {
                        "type": "SSML",
                        "ssml": "<speak>" + 'here are your notifications' + "</speak>"
                    },
                    "shouldEndSession": false
                },
                "sessionAttributes": intent.attributes
            }


            data.forEach(function (item) {
                if (item.MessageID) {
                    if (item.UserID) {
                        let listItem = {
                            "token": 'message-' + item.CaretakerID + '-' + item.CaretakerName + '-' + item.Message,
                            "textContent": {
                                "primaryText": {
                                    "text": item.Message,
                                    "type": "PlainText"
                                },
                                "secondaryText": {
                                    "text": 'Message from ' + item.CaretakerName,
                                    "type": "PlainText"
                                },
                                "tertiaryText": {
                                    "text": "Message",
                                    "type": "PlainText"
                                },
                            }
                        }
                        listItem["image"] = {
                            "sources": [{
                                //"url": "./assets/in_delivery_icon.png"
                                "url": "https://png.icons8.com/color/1600/new-message.png"
                        }]
                        }
                        response.response.directives[0].template.listItems.push(listItem)
                    }
                } else if (item.data.type == 'shopping-pickup') {
                    let listItem = {
                        "token": 'shoppingPickup-' + item.data.name + '-' + item.data.CaretakerName,
                        "textContent": {
                            "primaryText": {
                                "text": item.data.name,
                                "type": "PlainText"
                            }
                        }
                    }
                    listItem["image"] = {
                        "sources": [{
                            //"url": "./assets/in_delivery_icon.png"
                            "url": "http://flaticons.net/icons/Shopping/Add-To-Cart.png"
                        }]
                    }
                    listItem["textContent"]["secondaryText"] = {
                        "text": 'Picked up by ' + item.data.CaretakerName,
                        "type": "RichText"
                    }
                    listItem["textContent"]["tertiaryText"] = {
                        "text": "Shopping",
                        "type": "RichText"
                    }
                    response.response.directives[0].template.listItems.push(listItem)
                } else if (item.data.type == 'ride-claim') {
                    let listItem = {
                        "token": 'rideClaim-' + item.data.name + '-' + item.data.CaretakerName + '-' +
                            item.data.date,
                        "textContent": {
                            "primaryText": {
                                "text": item.data.name,
                                "type": "PlainText"
                            },
                            "secondaryText": {
                                "text": 'Ride claimed by ' + item.data.CaretakerName,
                                "type": "PlainText"
                            },
                            "tertiaryText": {
                                "text": "Ride",
                                "type": "PlainText"
                            },
                        }
                    }
                    listItem["image"] = {
                        "sources": [{
                            //"url": "./assets/in_delivery_icon.png"
                            "url": "http://turnerautocare.com/images/icon_7893_white.png"
                        }]
                    }
                    response.response.directives[0].template.listItems.push(listItem)

                } else if (item.data.type == 'ride-unclaim') {
                    let listItem = {
                        "token": 'rideUnclaim-' + item.data.name + '-' + item.data.CaretakerName + '-' +
                            item.data.date,
                        "textContent": {
                            "primaryText": {
                                "text": item.data.name,
                                "type": "PlainText"
                            },
                            "secondaryText": {
                                "text": "Ride cancelled by " + item.data.CaretakerName,
                                "type": "PlainText"
                            },
                            "tertiaryText": {
                                "text": "Ride",
                                "type": "PlainText"
                            },
                        }
                    }
                    listItem["image"] = {
                        "sources": [{
                            //"url": "./assets/in_delivery_icon.png"
                            "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/White_X_in_red_background.svg/2000px-White_X_in_red_background.svg.png"
                        }]
                    }
                    response.response.directives[0].template.listItems.push(listItem)
                }
            });

            intent.context.succeed(response);
        }
    });

}

// remove a date from a string 
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

// get all events (rides)
function getEvents(callbackFn) {
    let params = {
        TableName: 'Rides'
    };
    docClient.scan(params, (err, data) => {
        let events = [];
        data.Items.forEach(function (item) {
            events.push(item);
        })

        events.sort(function (a, b) {
            var keyA = a.timestamp,
                keyB = b.timestamp;
            // Compare the 2 dates
            if (keyA < keyB) return -1;
            if (keyA > keyB) return 1;
            return 0;
        });
        callbackFn(err, events);
    });
}

// get all caretakers from database
function getCaretakers(callbackFn) {
    let params = {
        TableName: 'Caretaker'
    };
    docClient.scan(params, (err, data) => {
        callbackFn(err, data.Items);
    });
}

// send message
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
            recordChange(() => {
                callbackFn(err, data);
            });
            //logActivity(message, function () {
            // })
        }
    });
}

// log an activity in the database
function logActivity(content, callbackFn) {
    var params = {
        Key: {
            ActivityID: Date.now()
        },
        AttributeUpdates: {
            data: {
                Action: 'PUT',
                Value: content
            },
            timestamp: {
                Action: 'PUT',
                Value: Date.now()
            },
            type: {
                Action: 'PUT',
                Value: 'message'
            }
        },
        TableName: 'Activity'
    }
    docClient.update(params, function (err, data) {
        if (typeof (callbackFn) == 'function') {
            console.log(err);
            callbackFn(err, data);
        }
    });
}

// add item info to database
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

// delete item info from database
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

// edit shopping item
function changeShoppingItem(oldItem, newItem, callbackFn) {
    removeShoppingItem(oldItem, function () {
        addShoppingItem(newItem, function () {
            callbackFn();
        })
    })
}


// cap first letter in a sentenc
function cap(str) {
    str = str.replace(/\b[a-z]/g, function (letter) {
        return letter.toUpperCase();
    });
    str = str.replace(/'(S)/g, function (letter) {
        return letter.toLowerCase();
    });
    return str;
}


// log ride rqeuest to database
function logRideRequest(event, date, time, callbackFn) {
    event = cap(event);
    var params = {
        Key: {
            id: date.toLocaleDateString() + time.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            })
        },
        AttributeUpdates: {
            event: {
                Action: 'PUT',
                Value: event
            },
            date: {
                Action: 'PUT',
                Value: date.toLocaleDateString()
            },
            time: {
                Action: 'PUT',
                Value: time.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                })
            },
            claimed: {
                Action: 'PUT',
                Value: false
            },
            timestamp: {
                Action: 'PUT',
                Value: (new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.getHours(), time.getMinutes(), 0, 0)).getTime()
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


// record change in database (for UI purposes)
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


// get shopping list from database
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


// get activitites from database
function getActivities(callbackFn) {
    var params = {
        TableName: 'Activity'
    }
    docClient.scan(params, function (err, activityData) {
        if (typeof (callbackFn) == 'function') {
            console.log(err);
            var activityList = [];

            getMessages((err, messageData) => {
                activityData.Items.forEach((item) => {
                    activityList.push(item);
                });
                messageData.forEach((item) => {
                    activityList.push(item);
                });

                activityList.sort(function (a, b) {
                    var keyA = a.timestamp,
                        keyB = b.timestamp;
                    if (keyA < keyB) return 1;
                    if (keyA > keyB) return -1;
                    return 0;
                });
                callbackFn(err, activityList);
            })
        }
    });
}

// get messages from database
function getMessages(callbackFn) {
    var params = {
        TableName: 'Message'
    }
    docClient.scan(params, function (err, data) {
        if (typeof (callbackFn) == 'function') {
            console.log(err);
            var messageList = [];

            data.Items.forEach((item) => {
                messageList.push(item);
            });
            messageList.sort(function (a, b) {
                var keyA = a.timestamp,
                    keyB = b.timestamp;
                if (keyA < keyB) return 1;
                if (keyA > keyB) return -1;
                return 0;
            });
            callbackFn(err, messageList);
        }
    });
}

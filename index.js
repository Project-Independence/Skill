var Alexa = require('alexa-sdk');

exports.handler = function(event, context, callback){
  var alexa = Alexa.handler(event, context);
  alexa.registerHandlers(handlers);
  alexa.execute();
};

var handlers = {

    'LaunchRequest': function () {
    this.emit(':ask', 'Hello World! This is a simple custom skill.', 'I am not able to do anything yet.');
    },
    'HelloIntent': function() {
        this.emit(':ask', 'Hello, what is your name?', 'Hi!');
    },
    'GoodbyeIntent': function() {
        this.emit(':ask', 'Bye!?', 'Later');
    },
    'Unhandled': function() {
        this.emit(':ask', 'I dont understand.');
    }


};
// comment
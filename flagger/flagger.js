var esprima = require("esprima");
var console = require("console");
var _ = require("underscore");
var fs = require("fs");
var exec = require("child_process").exec;
var esmorph= require("./esmorph-new.js");
runData = {};
content = undefined;

main();

function main() {
  mainVarDeclarations();
}


/* Pretty-print object as JSON. */
function prettyPrint(obj) {
    return JSON.stringify(obj, undefined, 2); // Use 2 spaces for indentation
}

/* See http://javascriptweblog.wordpress.com/2011/08/08/fixing-the-javascript-typeof-operator/ 
*/
function getType (obj) {
   return ({}).toString.call(obj).match(/\s([a-z|A-Z]+)/)[1].toLowerCase();
 }

/* ==== Test cases for running individual programs */
function mainVarDeclarations() {
    var filename = "./demo-varDeclarations.js";
    content = fs.readFileSync(filename, "utf-8");
    newContentDeclarations = instrumentDeclarations(content);
    try {
      eval(newContentDeclarations);
    } catch (error) {
        console.log("Error: evaluation of instrumented content failed.")
        console.log(error);
    }
}

function mainFields() {
    var filename = "./fieldCheck.js";
    content = fs.readFileSync(filename, "utf-8");
    createFieldContext();
    newContent_field = instrumentFieldTypes(content);
    try {
      eval(newContent_field);
      global.FIELDTRACE.printResults();
    } catch (error) {
        console.log("Error: evaluation of instrumented content failed.")
        console.log(error);
    }
}

function mainParamCheck() {
    var filename = "./demo-paramTypes.js";
    content = fs.readFileSync(filename, "utf-8");
    createParamTraceContext();
    newContent_param = instrumentParamTypes(content);
    try {
      eval(newContent_param);
      global.PARAMTRACE.printResults();
    } catch (error) {
        console.log("Error: evaluation of instrumented content failed.")
        console.log(error);
    }
}

/* TODO this seems to be not working as expected. */
function mainTryCatch() {
  tryCatch("../../floitsch-downloads/optimizing-for-v8/trace-inlining2.js")
}

/* ========= Code instrumentation: Track variable declarations ========*/


function instrumentDeclarations(code) {
    /* Using non-generic instrumentation */
    // tracer = esmorph.Tracer.VariableDeclaratorAfter(function (fn) {
    //      var signature = 'console.log("names:" + '  + JSON.stringify(fn.names) + ');';
    //      return signature;
    // });
    /* Using generic instrumentation */
    instrumentFcn = function (fn) {
         var names = fn.node.declarations.map(function(val) { return val.id.name});
         var signature = 'console.log("names:" + '  + JSON.stringify(names) + ');';
         return signature;
    }
    filterFcn = function(node) {
      return node && node.kind === "var";
    }
    tracer = esmorph.Tracer.InstrumentableLine(instrumentFcn, esmorph.Where.BEFORE, esprima.Syntax.VariableDeclaration, filterFcn);
    code = esmorph.modify(code, [tracer]);
    console.log(code)

    code = '(function() {\n' + code + '\n}())';
    return code;
}


/* ========= Code instrumentation: Parameter type change detection ========*/


function instrumentParamTypes(code) {
    tracer = esmorph.Tracer.FunctionEntrance(function (fn) {
        var paramNames = _.pluck(fn.paramData, "name")
        /* Construct a mapping from the parameter name to the parameter value 
            (which is accessed with the raw name inserted into the function call). */
        var paramPartials = _.map(paramNames, function(name) {
            return "'" + name + "': " + name;
        });
        var paramList = "{" + paramPartials.join(",") + "}"

         signature = 'global.PARAMTRACE.functionStart({ ';
            signature += 'paramValues: ' + paramList + ', ';  // the context-specific param values
            signature += 'fcnName: "' + fn.name + '", ';  // the function name
            signature += 'paramNames: ' + JSON.stringify(paramNames);  // the names of the params
         signature += ' });';
         return signature;
    });
    code = esmorph.modify(code, tracer);
    code = '(function() {\n' + code + '\n}())';
    return code
}


/* Creates the context global.PARAMTRACE for instrumenting parameters and
detecting functions that are called with parameters of different types. */
function createParamTraceContext() {
     global.PARAMTRACE = {
         paramData: {},  // Map functions to arrays of param types, empty if none.
         mismatches: new Logger("==Functions with type mismatches== "), 

         /* A call to functionStart should be inserted at the beginning of each 
         function. functionStart is given the parameter names and values, and updates
         paramData with information on the types of the parameters. 
         Updates the mismatches object with data on functions called with different
         types for the same parameter. */
         functionStart: function (data) {
            var fcnName = data.fcnName;
            var paramNames = data.paramNames;  // The parameter list.
            /* A mapping from a parameter name to the parameter value for all 
            parameters in the parameter list. */
            var paramValues = data.paramValues;
            if (!_.has(this.paramData, fcnName) ) {
                /* Initialize the mapping */
                this.paramData[fcnName] = {}
                /* For each parameter name for this function, add a mapping 
                from the param name to an empty array. */
                for (var i = 0; i < data.paramNames.length; i++) {
                    var paramValueType = getType(paramValues[paramNames[i]])
                    this.paramData[fcnName][paramNames[i]] = [paramValueType]
                }
            }
            else {
                /* Compare each param type against the previous type. */
                for (var i = 0; i < data.paramNames.length; i++) {
                    var currValue = paramValues[paramNames[i]];
                    var currType = getType(currValue)
                    var prevType = this.paramData[fcnName][paramNames[i]];
                    if (prevType != currType) {
                        // Mismatch
                        var message = "Mismatch: parameter " + currValue + " of type " + currType + " does not match previous parameter of type " + prevType + ".";
                        this.mismatches.addMessage(fcnName, message);
                    }
                }
                
            }
         },
         /* Should be called after the instrumented code has been executed. 
         Prints the results of the parameter type mismatch tracking.*/
         printResults: function() {
           this.mismatches.print();
         }
     };
 }

/* ========= Code instrumentation: Adding/deleting fields of an object ========*/


/* grab a recursive object access out of the syntax tree
cur and add it to the object tree tree (oops bad naming) */
function buildTree(tree, cur) {
    if(cur.type === esprima.Syntax.MemberExpression) {
        newTree = buildTree(tree, cur.object);
    } else {
        if(!(cur.name in tree)) {
            tree[cur.name] = {};
        }
        return tree[cur.name];
    }
    if(!(cur.property.name in tree)) {
        newTree[cur.property.name] = {};
    }
    return newTree[cur.property.name];
}

function instrumentFieldTypes(code) {             
    tracer = esmorph.Tracer.FunctionEntrance(function (fn) {
        var mods = {}
        var realBody = fn.body.body;
        //TODO check if it's a block statement?
        for(var i = 0; i < realBody.length; i++) {
            var line = realBody[i];
            if(line.type != esprima.Syntax.ExpressionStatement ||
               line.expression.type != esprima.Syntax.AssignmentExpression ||
               line.expression.left.type != esprima.Syntax.MemberExpression) continue;
            buildTree(mods, line.expression.left);
        }
        console.log(mods);
        var modString = JSON.stringify(mods);
        var varPartials = _.map(_.keys(mods), function(name) {
            return "'" + name + "': " + name;
        });
        var varList = "{" + varPartials.join(",") + "}";
        var signature = 'global.FIELDTRACE.functionStart({ ';
        signature += 'varList: ' + varList + ',';
        signature += 'modFields: ' + modString + ',';
        signature += 'fcnName: "' + fn.name + '", ';
        //signature += 'context: this,';
        signature += ' });';
        return signature;
    });
    code = esmorph.modify(code, tracer);
    code = '(function() {\n' + code + '\n}())';
    return code;
}

function Logger(headerMessage) {
    this.headerMessage = headerMessage;
    this.messageData = {};
    this.print = function() {
      console.log(this.headerMessage);
      _.each(this.messageData, function(value, key) {
                console.log("In function: " + key);
                _.each(value, function(message) {
        console.log("\t" + message)
                });
      });
    };
    this.addMessage = function(fnName, message) {
      if (!_.has(this.messageData, fnName)) {
                this.messageData[fnName] = [];
      }
      this.messageData[fnName].push(message);
    };
}

function createFieldContext() {
    global.FIELDTRACE = {
        logger: new Logger("==Fields added to objects on the fly=="),
        functionStart: function(modData) {
            console.log(modData);
            var fields =  modData.modFields;
            // Dig into objects
            var recursiveFieldCheck = function(start, used, parent, logger) {
                for(var field in used) {
                    if(!(field in start)) {
                        var message = "Field " + field + " added to " + parent;
                        logger.addMessage(modData.fcnName, message);
                    } else {
                        recursiveFieldCheck(start[field], used[field], parent + '.' + field, logger);
                    }
                }
            }
            for(item in modData.modFields) {
                // Only check if the object was in scope at the function start
                if(item in modData.varList) {
                    recursiveFieldCheck(modData.varList[item],
                                        modData.modFields[item],
                                        item, this.logger);
                }
            }
        },
        printResults: function() {
            this.logger.print();
        }
    };
}

 /* ========= Try-catch detection/analysis ========*/
 function tryCatch(filename) {
    // On other systems might need to change to ./d8
     var tree = esprima.parse(content, { tolerant: true, loc: true, range: true, comment: true });
     exec("~/v8/out/native/d8 --trace-inlining " + filename, function(error, stdout, stderr) {
         if (error) {
          console.log(error);
         }
         lines = stdout.split("\n");
         /* runData.inline is a map from function name to an object containing the 
          property calledFrom, which is a list of all the functions it has been 
         called from and flagged. */
         runData.inline = {};
         for (var i = 0; i < lines.length; i++) {
             var line = lines[i];
             processOutputLine(line);
         }
         findTry(tree);
     });
 }

/* Processes a line returned by stdout when V8 is run. */
function processOutputLine(line) {
    var matchPattern = "Did not inline ([^ ]*) called from ([^ ]*) \((.*)?\).";
    var result = line.match(matchPattern);
    if (!result) {
        return;
    }
    var fcnName = result[1];
    var callingFcn = result[2];
    var message = result[3];
    if (message.indexOf("not inlineable") != -1) {
        if (!runData.inline[fcnName]) {
            runData.inline[fcnName] = {};
        }
        if (runData.inline[fcnName].callingFcns) {
            runData.inline[fcnName].callingFcns.push(callingFcn);
        } else {
            runData.inline[fcnName].callingFcns = [callingFcn];
        }
    }
}



/* Processes a try object and outputs optimization suggestions. */
function isTry(obj, currFcn) {
    if (obj && obj.type === "TryStatement") {
        console.log("Offending code: starting at Line " + obj.loc.start.line + " in function " + currFcn);
        if (runData.inline[currFcn]) {
            console.log("Try/Catch likely prevented this function from being inlined by V8.");
        }
        console.log(content.slice(obj.range[0], obj.range[1]));
    }
}

/* Try-catch loops cannot be optimized. */
function findTry(ast) {
    traverse(ast, isTry, undefined);
}


// from https://github.com/ariya/esprima/blob/master/examples/findbooleantrap.js
// Executes visitor on the object and its children (recursively).
// Tracks the current containing function.
function traverse(object, visitor, currFcn) {
    var key, child;

    if (visitor.call(null, object, currFcn) === false) {
        return;
    }
    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null) {
                if(child.type == "FunctionDeclaration") {
                    currFcn = child.id.name
                }
                traverse(child, visitor, currFcn);
            }
        }
    }
}

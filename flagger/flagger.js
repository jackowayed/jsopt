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
    // var filename = "../../floitsch-downloads/optimizing-for-v8/trace-inlining2.js";
    var filename = "./foo.js";
    content = fs.readFileSync(filename, "utf-8");
    createTraceContexts();
    newContent = instrument(content);
    exec(newContent);
    // console.log(newContent);
    // On other systems might need to change to ./d8
    // tryCatch(filename)
}

/* ========= Code instrumentation ========*/


function instrument(code) {
    tracer = esmorph.Tracer.FunctionEntrance(function (fn) {
        // console.log(prettyPrint(fn.params));
         signature = 'PARAMTRACE.functionStart({ ';
            signature += 'params: ' + JSON.stringify(fn.params) + '", ';
            signature += 'name: "' + fn.name + '", ';
            // signature += 'lineNumber: ' + fn.loc.start.line + ', ';
            // signature += 'range: [' + fn.range[0] + ',' + fn.range[1] + ']';
         signature += ' });';
        // console.log(this)
         return signature;
     });
    code = esmorph.modify(code, tracer);
    code = '(function() {\n' + code + '\n}())';

    return code
}

function createTraceContexts() {
    global.FCNPARAMS = {};  // Map function names to their param list.
    // setupParamLists(global.FCNPARAMS);
     global.PARAMTRACE = {
         paramTypes: {},  // Map functions to arrays of param types, empty if none.
         functionStart: function (data) {
            // console.log("PARAMS: ") + data.params;
            fcnName = data.name;
            if (!_.has(this.paramTypes, fcnName) ) {
                this.paramTypes[fcnName] = {}
                /* For each parameter name for this function, add a mapping
                from the param name to an empty array. */
                for (var i = 0; i < data.params.length; i++) {
                    this.paramTypes[fcnName][params[i]] = []
                }
            }

             // var key = info.name + ':' + info.range[0];
             // if (this.hits.hasOwnProperty(key)) {
             //     this.hits[key] = this.hits[key] + 1;
             // } else {
             //     this.hits[key] = 1;
             // }
         }
         // getHistogram: function () {
         //     var entry,
         //         sorted = [];
         //     for (entry in this.hits) {
         //         if (this.hits.hasOwnProperty(entry)) {
         //             sorted.push({ name: entry, count: this.hits[entry]});
         //         }
         //     }
         //     sorted.sort(function (a, b) {
         //         return b.count - a.count;
         //     });
         //     return sorted;
         // }
     };
 }

 /* ========= Try-catch detection/analysis ========*/
 function tryCatch(filename) {
     var tree = esprima.parse(content, { tolerant: true, loc: true, range: true });
     exec("d8 --trace-inlining " + filename, function(error, stdout, stderr) {
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


/* Pretty-print object as JSON. */
function prettyPrint(obj) {
    return JSON.stringify(obj, undefined, 2); // Use 2 spaces for indentation
}

/* Processes a try object and outputs optimization suggestions. */
function isTry(obj, currFcn) {
    if (obj && obj.type =="TryStatement") {
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


/* Big comments in the middle of functions prevent the functions from being inlined */
function isBigComment(obj, currFcn) {
    // TODO
}

function findBigComment(ast) {
    traverse(ast, isBigComment, undefined);
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
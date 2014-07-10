/**
 * Adapts Jasmine-Node tests to work better with WebDriverJS. Borrows
 * heavily from the mocha WebDriverJS adapter at
 * https://code.google.com/p/selenium/source/browse/javascript/node/selenium-webdriver/testing/index.js
 */

var webdriver = require('selenium-webdriver');

var flow = webdriver.promise.controlFlow();

/**
 * Wraps a function so that all passed arguments are ignored.
 * @param {!Function} fn The function to wrap.
 * @return {!Function} The wrapped function.
 */
function seal(fn) {
  return function() {
    fn();
  };
}

/**
 * Validates that the parameter is a function.
 * @param {Object} functionToValidate The function to validate.
 * @throws {Error}
 * @return {Object} The original parameter.
 */
function validateFunction(functionToValidate) {
  if (functionToValidate && Object.prototype.toString.call(functionToValidate) === '[object Function]') {
    return functionToValidate;
  } else {
    throw Error(functionToValidate + ' is not a function');
  }
}

/**
 * Validates that the parameter is a number.
 * @param {Object} numberToValidate The number to validate.
 * @throws {Error}
 * @return {Object} The original number.
 */
function validateNumber(numberToValidate) {
  if (!isNaN(numberToValidate)) {
    return numberToValidate;
  } else {
    throw Error(numberToValidate + ' is not a number');
  }
}

/**
 * Validates that the parameter is a string.
 * @param {Object} stringToValidate The string to validate.
 * @throws {Error}
 * @return {Object} The original string.
 */
function validateString(stringtoValidate) {
  if (typeof stringtoValidate == 'string' || stringtoValidate instanceof String) {
    return stringtoValidate;
  } else {
    throw Error(stringtoValidate + ' is not a string');
  }
}

/**
 * Wraps a function so it runs inside a webdriver.promise.ControlFlow and
 * waits for the flow to complete before continuing.
 * @param {!Function} globalFn The function to wrap.
 * @return {!Function} The new function.
 */
function wrapInControlFlow(globalFn, fnName) {
  return function() {
    var driverError = new Error();
    driverError.stack = driverError.stack.replace(/ +at.+jasminewd.+\n/, '');

    function asyncTestFn(fn, desc, opt_timeout) {
      return function(done) {
        var desc_ = 'Asynchronous test function: ' + fnName + '(';
        if (desc) {
          desc_ += '"' + desc + '"';
        }
        desc_ += ')';

        var retry_timeout_ = (jasmine.getEnv().defaultTimeoutInterval * 0.8) || 1000;
        if (opt_timeout) {
          retry_timeout_ = opt_timeout;
        }

        // deferred object for signaling completion of asychronous function within globalFn
        var asyncFnDone = webdriver.promise.defer();

        if (fn.length === 0) {
          // function with globalFn not asychronous
          asyncFnDone.fulfill();
        } else if (fn.length > 1) {
          throw Error('Invalid # arguments (' + fn.length + ') within function "' + fnName +'"');
        }

        ///////////
        // Retry //
        ///////////
        var flowFinished;

        if (fnName === 'rit' || fnName === 'rrit') {
          asyncFnDone.fulfill(); // not used on retries
          
          // With retry
          jasmine.getEnv().currentSpec.currentWaitIteration = -1;
          jasmine.getEnv().currentSpec.tempMatcherResults = [];
          
          flowFinished = flow.wait(function() {
            jasmine.getEnv().currentSpec.currentWaitIteration++;
            jasmine.getEnv().currentSpec.initialCountOfMatcherResults = 
              jasmine.getEnv().currentSpec.tempMatcherResults.length;
            var promiseIteration = webdriver.promise.defer();

            flow.execute(function() {
              flow.on('uncaughtException', function(e) {
                var webdriverFailure = e.stack == null ? e : e.stack.split(":")[0];
                var expectationResult = new jasmine.ExpectationResult({
                  passed: false,
                  message: 'Webdriver failure: ' + webdriverFailure,
                  trace: e
                }); // temporary add them to the temp errors stack
                jasmine.getEnv().currentSpec.tempMatcherResults =
                  jasmine.getEnv().currentSpec.tempMatcherResults || [];
                jasmine.getEnv().currentSpec.tempMatcherResults.push(expectationResult);
                if (jasmine.getEnv().additionalScreenShots) {
                  jasmine.getEnv().additionalScreenShots(e.stack, null, expectationResult, 'TempErr');
                }
                if (jasmine.getEnv().currentSpec.lastUncaughtException !== expectationResult.message) {
                  console.log("\nWarning, uncaughtException: " + expectationResult.message);
                  jasmine.getEnv().currentSpec.lastUncaughtException = expectationResult.message;
                }
                promiseIteration.fulfill(false);
              });

              fn.call(jasmine.getEnv().currentSpec, function(userError) {
                if (fn.length !== 0 && userError) {
                  var expectationResult = new jasmine.ExpectationResult({
                    passed: false,
                    message: 'At done func with error: ' + userError,
                    trace: (new Error(userError))
                  }); // temporary add them to the temp errors stack
                  jasmine.getEnv().currentSpec.tempMatcherResults.push(expectationResult);
                  if (jasmine.getEnv().additionalScreenShots) {
                    jasmine.getEnv().additionalScreenShots(expectationResult.trace.stack, null, expectationResult, 'TempErr');
                  }
                  jasmine.getEnv().currentSpec.startMatcherResultsCount++;
                  promiseIteration.fulfill(false);
                } else {
                  promiseIteration.fulfill(true);
                }
              });
            }, desc_).then(function() {
              promiseIteration.fulfill(true);
            }, function(e) {
              var expectationResult = new jasmine.ExpectationResult({
                passed: false,
                message: 'Webdriver failure: ' + e.stack.split(":")[0],
                trace: e
              }); // temporary add them to the temp errors stack
              jasmine.getEnv().currentSpec.tempMatcherResults.push(expectationResult);
              if (jasmine.getEnv().additionalScreenShots) {
                jasmine.getEnv().additionalScreenShots(e.stack, null, expectationResult, 'TempErr');
              }
              promiseIteration.fulfill(false);
            });

            return promiseIteration.then(function(retValue) {
              if (jasmine.getEnv().currentSpec.tempMatcherResults.length >
                  jasmine.getEnv().currentSpec.initialCountOfMatcherResults) {
                return false;
              } else {
                return retValue;
              }
            });

          }, retry_timeout_, 'At ' + fnName + '() block');

        } else {
          // Without retry
          flowFinished = flow.execute(function() {
            fn.call(jasmine.getEnv().currentSpec, function(userError) {
              if (userError) {
                asyncFnDone.reject(new Error(userError));
              } else {
                asyncFnDone.fulfill();
              }
            });
          }, desc_);
        }

        webdriver.promise.all([asyncFnDone, flowFinished]).then(function() {
          seal(done)();
        }, function(e) {
          // Fail fast
          jasmine.getEnv().specFilter = function(spec) {
              return false;
          };
          // Take an additional screen shot to help debugging
          if (jasmine.getEnv().additionalScreenShots) {
            var matchTrace = new Error("FAILED-LAST");
            var traceStr = matchTrace.stack.
                              replace(/ +at.+jasminewd.+\n/g, '').
                              replace(/ +at.+selenium-webdriver.+\n/g, '');
            jasmine.getEnv().additionalScreenShots(traceStr, null, null, 'FAILED-LAST');
          }
          if (fnName === 'rit' || fnName === 'rrit') {
            // Report only the last retry collected errors
            var tempMatcherResults = jasmine.getEnv().currentSpec.tempMatcherResults;
            for (var i = jasmine.getEnv().currentSpec.initialCountOfMatcherResults;
                 i < tempMatcherResults.length; i++) {
              var expectationResult = tempMatcherResults[i];
              jasmine.getEnv().currentSpec.addMatcherResult(expectationResult);
            }
            // No need to pollute the error results with the retry so skip done(e);
            // e.stack = e.stack + '==== within retry task ====\n' + driverError.stack;
            // done(e);
          } else {
            // Default it/iit behaviour
            e.stack = e.stack + '==== async task ====\n' + driverError.stack;
            done(e);
          }
        });
      };
    }

    var description, func, timeout;
    switch (fnName) {
      case 'it':
      case 'iit':
      case 'rit':
      case 'rrit':
        description = validateString(arguments[0]);
        func = validateFunction(arguments[1]);
        if (!arguments[2]) {
          globalFn(description, asyncTestFn(func));
        } else {
          timeout = validateNumber(arguments[2]);
          globalFn(description, asyncTestFn(func, null, timeout), timeout);
        }
        break;
      case 'beforeEach':
      case 'afterEach':
        func = validateFunction(arguments[0]);
        if (!arguments[1]) {
          globalFn(asyncTestFn(func));
        } else {
          timeout = validateNumber(arguments[1]);
          globalFn(asyncTestFn(func), timeout);
        }
        break;
      default:
        throw Error('invalid function: ' + fnName);
    }
  };
}

global.rit = global.it;
global.rrit = global.iit;

global.it = wrapInControlFlow(global.it, 'it');
global.iit = wrapInControlFlow(global.iit, 'iit');
global.rit = wrapInControlFlow(global.rit, 'rit');
global.rrit = wrapInControlFlow(global.rrit, 'rrit');
global.beforeEach = wrapInControlFlow(global.beforeEach, 'beforeEach');
global.afterEach = wrapInControlFlow(global.afterEach, 'afterEach');


/**
 * Wrap a Jasmine matcher function so that it can take webdriverJS promises.
 * @param {!Function} matcher The matcher function to wrap.
 * @param {webdriver.promise.Promise} actualPromise The promise which will
 *     resolve to the actual value being tested.
 * @param {boolean} not Whether this is being called with 'not' active.
 */
function wrapMatcher(matcher, actualPromise, not) {
  return function() {
    var originalArgs = arguments;
    var matchError = new Error("Failed expectation");
    matchError.stack = matchError.stack.replace(/ +at.+jasminewd.+\n/, '');
    var expected = originalArgs[0];
    actualPromise.then(function(actual) {
      var expectation = originalExpect(actual);
      if (not) {
        expectation = expectation.not;
      }
      var originalAddMatcherResult = expectation.spec.addMatcherResult;
      var error = matchError;
      expectation.spec.addMatcherResult = function(result) {
        result.trace = error;
        if (result.passed_ || jasmine.getEnv().currentSpec.currentWaitIteration == null) {
          jasmine.Spec.prototype.addMatcherResult.call(this, result);
        } else {
          jasmine.getEnv().currentSpec.tempMatcherResults.push(result);
          if (jasmine.getEnv().additionalScreenShots) {
            jasmine.getEnv().additionalScreenShots(error.stack, null, result, 'TempErr');
          }
        }
      };

      if (expected instanceof webdriver.promise.Promise) {
        if (originalArgs.length > 1) {
          throw error('Multi-argument matchers with promises are not ' +
              'supported.');
        }
        expected.then(function(exp) {
          expectation[matcher].apply(expectation, [exp]);
          expectation.spec.addMatcherResult = originalAddMatcherResult;
        });
      } else {
        expectation.spec.addMatcherResult = function(result) {
          result.trace = error;
          if (result.passed_ || jasmine.getEnv().currentSpec.currentWaitIteration == null) {
            originalAddMatcherResult.call(this, result);
          } else {
            jasmine.getEnv().currentSpec.tempMatcherResults.push(result);
            if (jasmine.getEnv().additionalScreenShots) {
              jasmine.getEnv().additionalScreenShots(error.stack, null, result, 'TempErr');
            }
          }
        };
        expectation[matcher].apply(expectation, originalArgs);
        expectation.spec.addMatcherResult = originalAddMatcherResult;
      }
    }, function(e) {
      // Catch webdriver errors and turn them into expectation errors
      var expectationResult = new jasmine.ExpectationResult({
        passed: false,
        expected: expected,
        message: 'Webdriver failure: ' + e.stack.split(":")[0],
        trace: matchError
      });
      // Retry: only add each addMatcherResult failure once, i.e. the first time
      if (jasmine.getEnv().currentSpec.currentWaitIteration == null) {
        throw e;
      } else {
        jasmine.getEnv().currentSpec.tempMatcherResults.push(expectationResult);
        if (jasmine.getEnv().additionalScreenShots) {
          jasmine.getEnv().additionalScreenShots(matchError.stack, null, expectationResult, 'TempErr');
        }
      }
    });
  };
}


/**
 * Wrap a Jasmine matcher function so that it can retry expectations.
 * @param {!Function} matcher The matcher function to wrap.
 * @param {Object} actualValue The actual value being tested.
 * @param {boolean} not Whether this is being called with 'not' active.
 */
function wrapRetryMatcher(matcher, actualValue, not) {
  return function() {
    var originalArgs = arguments;
    var matchError = new Error("Failed expectation");
    matchError.stack = matchError.stack.replace(/ +at.+jasminewd.+\n/, '');
    var expected = originalArgs[0];

    var expectation = originalExpect(actualValue);
    if (not) {
      expectation = expectation.not;
    }
    var originalAddMatcherResult = expectation.spec.addMatcherResult;
    var error = matchError;
    expectation.spec.addMatcherResult = function(result) {
      result.trace = error;
      if (result.passed_ || jasmine.getEnv().currentSpec.currentWaitIteration == null) {
        jasmine.Spec.prototype.addMatcherResult.call(this, result);
      } else {
        jasmine.getEnv().currentSpec.tempMatcherResults.push(result);
        if (jasmine.getEnv().additionalScreenShots) {
          jasmine.getEnv().additionalScreenShots(error.stack, null, result, 'TempErr');
        }
      }
    };

    if (expected instanceof webdriver.promise.Promise) {
      if (originalArgs.length > 1) {
        throw error('Multi-argument matchers with promises are not ' +
            'supported.');
      }
      expected.then(function(exp) {
        expectation[matcher].apply(expectation, [exp]);
        expectation.spec.addMatcherResult = originalAddMatcherResult;
      });
    } else {
      expectation.spec.addMatcherResult = function(result) {
        result.trace = error;
        if (result.passed_ || jasmine.getEnv().currentSpec.currentWaitIteration == null) {
          originalAddMatcherResult.call(this, result);
        } else {
          jasmine.getEnv().currentSpec.tempMatcherResults.push(result);
          if (jasmine.getEnv().additionalScreenShots) {
            jasmine.getEnv().additionalScreenShots(error.stack, null, result, 'TempErr');
          }
        }
      };
      expectation[matcher].apply(expectation, originalArgs);
      expectation.spec.addMatcherResult = originalAddMatcherResult;
    }
  };
}

/**
 * Return a chained set of matcher functions which will be evaluated
 * after actualPromise is resolved.
 * @param {webdriver.promise.Promise} actualPromise The promise which will
 *     resolve to the acutal value being tested.
 */
function promiseMatchers(actualPromise) {
  var promises = {not: {}};
  var env = jasmine.getEnv();
  var matchersClass = env.currentSpec.matchersClass || env.matchersClass;

  for (var matcher in matchersClass.prototype) {
    promises[matcher] = wrapMatcher(matcher, actualPromise, false);
    promises.not[matcher] = wrapMatcher(matcher, actualPromise, true);
  }

  return promises;
}


/**
 * Return a chained set of matcher functions which avoids reporting
 * result errors when using retry it, i.e. rit() or rrit()
 * @param {Object} actualValue The actual value being tested
 */
function retryMatchers(actualValue) {
  var rMatchers = {not: {}};
  var env = jasmine.getEnv();
  var matchersClass = env.currentSpec.matchersClass || env.matchersClass;

  for (var matcher in matchersClass.prototype) {
    rMatchers[matcher] = wrapRetryMatcher(matcher, actualValue, false);
    rMatchers.not[matcher] = wrapRetryMatcher(matcher, actualValue, true);
  }

  return rMatchers;
}

var originalExpect = global.expect;

global.expect = function(actual) {
  var retMatchers;
  if (actual instanceof webdriver.promise.Promise) {
    if (actual instanceof webdriver.WebElement) {
      throw 'expect called with WebElement argument, expected a Promise. ' +
          'Did you mean to use .getText()?';
    }
    retMatchers = promiseMatchers(actual);
  } else {
    retMatchers = retryMatchers(actual);
  }

  // Take additional screen shots here if the function is available
  if (jasmine.getEnv().additionalScreenShots) {
    var matchTrace = new Error("Expectation");
    var traceStr = matchTrace.stack.
                      replace(/ +at.+jasminewd.+\n/g, '').
                      replace(/ +at.+selenium-webdriver.+\n/g, '');
    jasmine.getEnv().additionalScreenShots(traceStr, null, null, 'expect');
  }

  return retMatchers;
};

// Wrap internal Jasmine function to allow custom matchers
// to return promises that resolve to truthy or falsy values
var originalMatcherFn = jasmine.Matchers.matcherFn_;
jasmine.Matchers.matcherFn_ = function(matcherName, matcherFunction) {
  var matcherFnThis = this;
  var matcherFnArgs = jasmine.util.argsToArray(arguments);
  return function() {
    var matcherThis = this;
    var matcherArgs = jasmine.util.argsToArray(arguments);
    var result = matcherFunction.apply(this, arguments);

    if (result instanceof webdriver.promise.Promise) {
      result.then(function(resolution) {
        matcherFnArgs[1] = function() {
          return resolution;
        };
        // Monkey patch addMatcherResult to support retry
        var originalAddMatcherResult;
        if (!/currentWaitIteration/.test(
            matcherThis.spec.addMatcherResult.toString())) {
          // var matchError = new Error("Failed expectation");
          // matchError.stack = matchError.stack.replace(/ +at.+jasminewd.+\n/, '');
          originalAddMatcherResult = matcherThis.spec.addMatcherResult;
          matcherThis.spec.addMatcherResult = function(result) {
            result.trace = matcherThis.spec.lastStackTrace || result.trace;
            if (result.passed_ || jasmine.getEnv().currentSpec.currentWaitIteration == null) {
              originalAddMatcherResult.call(this, result);
            } else {
              jasmine.getEnv().currentSpec.tempMatcherResults.push(result);
              if (jasmine.getEnv().additionalScreenShots) {
                jasmine.getEnv().additionalScreenShots(result.trace.stack, null, result, 'TempErr');
              }
            }
          };
        }
        // Execute custom matcher
        originalMatcherFn.apply(matcherFnThis, matcherFnArgs).
            apply(matcherThis, matcherArgs);
        // Restore addMatcherResult
        if (originalAddMatcherResult) {
          matcherThis.spec.addMatcherResult = originalAddMatcherResult;
        }
      });
    } else {
      originalMatcherFn.apply(matcherFnThis, matcherFnArgs).
          apply(matcherThis, matcherArgs);
    }
  };
};

/**
 * A Jasmine reporter which does nothing but execute the input function
 * on a timeout failure.
 */
var OnTimeoutReporter = function(fn) {
  this.callback = fn;
};

OnTimeoutReporter.prototype.reportRunnerStarting = function() {};
OnTimeoutReporter.prototype.reportRunnerResults = function() {};
OnTimeoutReporter.prototype.reportSuiteResults = function() {};
OnTimeoutReporter.prototype.reportSpecStarting = function() {};
OnTimeoutReporter.prototype.reportSpecResults = function(spec) {
  if (!spec.results().passed()) {
    var result = spec.results();
    var failureItem = null;

    var items_length = result.getItems().length;
    for (var i = 0; i < items_length; i++) {
      if (result.getItems()[i].passed_ === false) {
        failureItem = result.getItems()[i];

        if (failureItem.toString().match(/timeout/)) {
          this.callback();
        }
      }
    }
  }
};
OnTimeoutReporter.prototype.log = function() {};

// On timeout, the flow should be reset. This will prevent webdriver tasks
// from overflowing into the next test and causing it to fail or timeout
// as well. This is done in the reporter instead of an afterEach block
// to ensure that it runs after any afterEach() blocks with webdriver tasks
// get to complete first.
jasmine.getEnv().addReporter(new OnTimeoutReporter(function() {
  flow.reset();
}));

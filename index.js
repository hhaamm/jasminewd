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
 * Also adds options features like {detailTestLevel: 1}.
 * @param {!Function} globalFn The function to wrap.
 * @param {!String} fnName The function name.
 * @return {!Function} The new function.
 */
function wrapInControlFlow(globalFn, fnName) {
  return function() {
    var driverError = new Error();
    // driverError.stack = driverError.stack.replace(/ +at.+jasminewd.+\n/, '');

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
        var currentSpec = jasmine.getEnv().currentSpec; //shortcut

        if (fnName === 'rit' || fnName === 'rrit') {
          asyncFnDone.fulfill(); // not used on retries

          // With retry
          currentSpec.currentWaitIteration = -1;
          currentSpec.tempMatcherResults = [];

          flowFinished = flow.wait(function() {
            currentSpec.currentWaitIteration++;
            currentSpec.initialCountOfMatcherResults =
              currentSpec.tempMatcherResults.length;
            var promiseIteration = webdriver.promise.defer();

            flow.execute(function() {
              flow.on('uncaughtException', function(e) {
                var webdriverFailure = (e.stack == null || !e.stack.toString().split) ?
                                        e : e.stack.toString().split(":")[0];
                var expectationResult = new jasmine.ExpectationResult({
                  passed: false,
                  message: 'Webdriver failure: ' + webdriverFailure,
                  trace: e
                }); // temporary add them to the temp errors stack
                currentSpec.tempMatcherResults =
                  currentSpec.tempMatcherResults || [];
                currentSpec.tempMatcherResults.push(expectationResult);
                if (jasmine.getEnv().additionalScreenShots) {
                  jasmine.getEnv().additionalScreenShots(e.stack, null, expectationResult, 'TempErr');
                }
                if (jasmine.getEnv().lastUncaughtExceptionMsg !== expectationResult.message) {
                  jasmine.getEnv().lastUncaughtExceptionMsg = expectationResult.message;
                  console.warn("\nWarning, uncaughtException: " + expectationResult.message);
                  var stackTrace = e.stack;
                  if (typeof E2e === 'object' && E2e.filterStackTraceFn) {
                    stackTrace = E2e.filterStackTraceFn(stackTrace);
                  }
                  console.warn(stackTrace);
                }
                promiseIteration.fulfill(false);
              });

              fn.call(currentSpec, function(userError) {
                if (fn.length !== 0 && userError) {
                  var expectationResult = new jasmine.ExpectationResult({
                    passed: false,
                    message: 'At done func with error: ' + userError,
                    trace: (new Error(userError))
                  }); // temporary add them to the temp errors stack
                  currentSpec.tempMatcherResults.push(expectationResult);
                  if (jasmine.getEnv().additionalScreenShots) {
                    jasmine.getEnv().additionalScreenShots(expectationResult.trace.stack, null, expectationResult, 'TempErr');
                  }
                  promiseIteration.fulfill(false);
                } else {
                  promiseIteration.fulfill(true);
                }
              });
            }, desc_).then(function() {
              promiseIteration.fulfill(true);
            }, function(e) {
              var webdriverFailure = (e.stack == null || !e.stack.toString().split) ?
                                      e : e.stack.toString().split(":")[0];
              var expectationResult = new jasmine.ExpectationResult({
                passed: false,
                message: 'Webdriver failure: ' + webdriverFailure,
                trace: e
              }); // temporary add them to the temp errors stack
              currentSpec.tempMatcherResults.push(expectationResult);
              if (jasmine.getEnv().additionalScreenShots) {
                jasmine.getEnv().additionalScreenShots(e.stack, null, expectationResult, 'TempErr');
              }
              promiseIteration.fulfill(false);
            });

            return promiseIteration.then(function(retValue) {
              if (currentSpec.tempMatcherResults.length >
                  currentSpec.initialCountOfMatcherResults) {
                return false;
              } else {
                return retValue;
              }
            });

          }, retry_timeout_, 'At ' + fnName + '() block');

        } else {
          // Without retry
          flowFinished = flow.execute(function() {
            fn.call(currentSpec, function(userError) {
              if (userError) {
                var err = new Error(userError);
                if (currentSpec.lastErrorTrace &&
                    currentSpec.lastErrorTrace.stack) {
                  err.stack += currentSpec.lastErrorTrace.stack;
                }
                asyncFnDone.reject(err);
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
            var traceStr = matchTrace.stack;
            // var traceStr = matchTrace.stack.
            //                   replace(/ +at.+jasminewd.+\n/g, '').
            //                   replace(/ +at.+selenium-webdriver.+\n/g, '');
            jasmine.getEnv().additionalScreenShots(traceStr, null, null, 'FAILED-LAST');
          }
          var tempMatcherResults = currentSpec.tempMatcherResults;
          var taskTraceLine = '';
          if (fnName === 'rit' || fnName === 'rrit') {
            taskTraceLine = '==== retry task ====\n';
          } else {
            taskTraceLine = '==== async task ====\n';
          }
          if (tempMatcherResults && tempMatcherResults.length > 0) {
            // Report only the last retry collected errors
            for (var i = currentSpec.initialCountOfMatcherResults;
                 i < tempMatcherResults.length; i++) {
              var expectationResult = tempMatcherResults[i];
              var msg = expectationResult.trace.message;
              if (currentSpec.lastErrorTrace &&
                  currentSpec.lastErrorTrace.stack) {
                expectationResult.trace.stack += currentSpec.lastErrorTrace.stack;
              }
              expectationResult.trace.stack += taskTraceLine;
              expectationResult.trace.stack += driverError.stack;
              currentSpec.addMatcherResult(expectationResult);
            }
          }
          e.stack += taskTraceLine;
          // Include custom stack traces from Jasmine users
          if (currentSpec.lastErrorTrace &&
              currentSpec.lastErrorTrace.stack) {
            e.stack += currentSpec.lastErrorTrace.stack;
          }
          e.stack += driverError.stack;
          done(e);
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
        var timeoutArg = arguments[2];
        var opts = arguments[3]; // additional options like detailTestLevel
        var executeSpec = true;
        if (opts && opts.detailTestLevel && jasmine.getEnv().detailTestLevel != null) {
          executeSpec = jasmine.getEnv().detailTestLevel >= opts.detailTestLevel;
        }
        if (!timeoutArg) {
          if (executeSpec) {
            globalFn(description, asyncTestFn(func));
          }
        } else {
          if (executeSpec) {
            timeout = validateNumber(timeoutArg);
            globalFn(description, asyncTestFn(func, null, timeout), timeout);
          }
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

// Default deep testing level is 0 (fast)
jasmine.getEnv().detailTestLevel = 0;

/**
 * Set deep testing level for upcoming tests. Used to control fast/slow testing
 * @param  {Number} numLevel Deep testing level, default: 0 (fast)
 */
jasmine.getEnv().setDetailTestLevel = function(numLevel) {
  if (typeof numLevel !== 'number') throw new Error(
    'numLevel must be a number but is: ' + numLevel);

  global.it('set detailTestLevel: ' + numLevel, function() {
    jasmine.getEnv().originalSpecLevel =
      jasmine.getEnv().detailTestLevel || 0;
    jasmine.getEnv().detailTestLevel = numLevel;
  });

  jasmine.getEnv().originalSuiteLevel =
    jasmine.getEnv().detailTestLevel || 0;
  jasmine.getEnv().detailTestLevel = numLevel;
};

/**
 * Restore deep testing level. Used to restore fast/slow testing speed.
 */
jasmine.getEnv().restoreDetailTestLevel = function() {
  global.it('restore detailTestLevel', function() {
    jasmine.getEnv().detailTestLevel = jasmine.getEnv().originalSpecLevel;
  });

  jasmine.getEnv().detailTestLevel = jasmine.getEnv().originalSuiteLevel;
};

/**
 * Better DSL to perform jasmine tests at a specified deep level
 * @param  {Number}   numLevel Deep testing level, default: 0 (fast)
 *  0 = only run faster inevitable tests/steps
 *  1 = also run detailed test, i.e. deep testing >= 1
 *  2 = also run exhaustive test, i.e. deep testing >= 2
 * @param  {Function} opt_fn       Callback proc of what to execute at the
 *  specified numLevel.
 *  If omitted then this method will only set current detail test level.
 */
global.jF = function(numLevel, opt_fn) {
  if (typeof numLevel !== 'number') throw new Error(
    'numLevel is required and must be a number but is: ' + numLevel);
  if (opt_fn != null && typeof opt_fn !== 'function') throw new Error(
    'When opt_fn is set it must be a function but is: ' + opt_fn);

  jasmine.getEnv().setDetailTestLevel(numLevel);
  if (opt_fn != null) {
    opt_fn();
  }
  jasmine.getEnv().restoreDetailTestLevel();
};

/**
 * Jasmine schedule below specs only if current deep test level >= numLevel
 * @param  {Number}   numLevel Deep testing level
 *  0 = always execute this test, i.e. further steps may not work if not run
 *  1 = detailed test; only execute when current deep testing >= 1
 *  2 = more exhaustive test; only execute when current deep testing >= 2
 * @param  {Function} fn       Callback proc of what to execute if the
 *  current deep testing level is >= numLevel.
 */
global.ifjF = function(numLevel, fn) {
  if (typeof numLevel !== 'number') throw new Error(
    'numLevel is required and must be a number but is: ' + numLevel);
  if (typeof fn !== 'function') throw new Error(
    'fn is required and must be a function but is: ' + fn);

  if (jasmine.getEnv().detailTestLevel >= numLevel) {
    fn();
  }
};

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
    // matchError.stack = matchError.stack.replace(/ +at.+jasminewd.+\n/, '');
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

      if (webdriver.promise.isPromise(expected)) {
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
      var webdriverFailure = (e.stack == null || !e.stack.toString().split) ?
                              e : e.stack.toString().split(":")[0];
      var expectationResult = new jasmine.ExpectationResult({
        passed: false,
        expected: expected,
        message: 'Webdriver failure: ' + webdriverFailure,
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
    // matchError.stack = matchError.stack.replace(/ +at.+jasminewd.+\n/, '');
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
 *     resolve to the actual value being tested.
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
  if (webdriver.promise.isPromise(actual)) {
    if (actual instanceof webdriver.WebElement) {
      console.warn('Warning: expect called with WebElement argument, ' +
        'usually expected a Promise. Did you mean to use .getText()?');
    }
    retMatchers = promiseMatchers(actual);
  } else {
    retMatchers = retryMatchers(actual);
  }

  // Take additional screen shots here if the function is available
  if (jasmine.getEnv().additionalScreenShots) {
    var matchTrace = new Error("Expectation");
    var traceStr = matchTrace.stack;
    // var traceStr = matchTrace.stack.
    //                   replace(/ +at.+jasminewd.+\n/g, '').
    //                   replace(/ +at.+selenium-webdriver.+\n/g, '');
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

    if (webdriver.promise.isPromise(result)) {
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
            result.trace = matcherThis.spec.lastErrorTrace || result.trace;
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

        var jasmineTimeoutRegexp =
            /timed out after \d+ msec waiting for spec to complete/;
        if (failureItem.toString().match(jasmineTimeoutRegexp)) {
          if (!failureItem.trace.stack) {
            if (spec.lastErrorTrace) {
              failureItem.trace = spec.lastErrorTrace;
            } else {
              // Stacktrace: undefined
              //  failureItem.trace = new Error('Timeout trace');
            }
          } else if (spec.lastErrorTrace) {
            failureItem.trace.stack += spec.lastErrorTrace.stack;
          }
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
  console.warn('-A Jasmine spec timed out. Resetting the WebDriver Control Flow.-');
  console.warn('The last active task was: ');
  var stackTrace = 'unknown';
  if ( flow.activeFrame_  && flow.activeFrame_.getPendingTask() ) {
    stackTrace = flow.activeFrame_.getPendingTask().toString();
    if (typeof E2e === 'object' && E2e.filterStackTraceFn) {
      stackTrace = E2e.filterStackTraceFn(stackTrace);
    }
  }
  console.warn(stackTrace);
  flow.reset();
}));

jasminewd [![Build Status](https://travis-ci.org/angular/jasminewd.png?branch=master)](https://travis-ci.org/angular/jasminewd)
=========

Adapter for Jasmine-to-WebDriverJS. Used by [Protractor](http://www.github.com/angular/protractor).


Added Features in this Fork
---------------------------

 - `rit()` and `rrit()` wrappers around it() and iit() implement the [Spin Asserts](https://saucelabs.com/resources/selenium/lose-races-and-win-at-selenium) pattern. The basic idea is pretty simple; within an `rit()` block, if any expectation fails or there is some webdriver error it will automatically retry the whole block up to `jasmine.getEnv().defaultTimeoutInterval` or whatever 3rd argument passed if any.
 - Within a `rit()` block it is possible to trace in which retry iteration the spec is with `this.currentWaitIteration`, `0` means is the first time, 1 means is happening during the first retry and so on.
 - Is possible to skip certain redundant test when `jasmine.getEnv().setSkipDetailedSpecs(true);` via a third argument: `rit(desc, fn, {skippable: true})`. I needed a way to skip certain tests when targeting faster test steps, e.g. skip testing for the whole page elements when we just want to know that the page loaded in order to keep going with something else.

Issues with this Fork
---------------------

 - Code is ugly but does the job (PR's are welcome).
 - Jasmine frozen to 1.3.1 through minijasminenode 0.4.0 dependency.

Features
--------

 - Automatically makes tests asynchronously wait until the WebDriverJS control flow is empty.

 - If a `done` function is passed to the test, waits for both the control flow and until done is called.

 - Enhances `expect` so that it automatically unwraps promises before performing the assertion.

Installation
------------
```
npm install jasminewd
```

Usage
-----

Assumes selenium-webdriver as a peer dependency.

```js
// In your setup.
var minijn = require('minijasminenode');
require('jasminewd');

global.driver = new webdriver.Builder().
    usingServer('http://localhost:4444/wd/hub').
    withCapabilities({browserName: 'chrome'}).
    build();

minijn.executeSpecs(/* ... */);

// In your tests

describe('tests with webdriver', function() {
  it('will wait until webdriver is done', function() {
    // This will be an asynchronous test. It will finish once webdriver has
    // loaded the page, found the element, and gotten its text.
    driver.get('http://www.example.com');

    var myElement = driver.findElement(webdriver.By.id('hello'));

    // Here, expect understands that myElement.getText() is a promise,
    // and resolves it before asserting.
    expect(myElement.getText()).toEqual('hello world');
  });
})
```

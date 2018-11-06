/*
  Copyright 2018 Google LLC

  Use of this source code is governed by an MIT-style
  license that can be found in the LICENSE file or at
  https://opensource.org/licenses/MIT.
*/

import './_version.mjs';

import {logger, setLoggerLevel} from '../workbox-core/_private/logger.mjs';
import LOG_LEVELS from '../workbox-core/models/LogLevels.mjs';

setLoggerLevel(LOG_LEVELS.debug);

const now = () => {
  return String(Date.now()).slice(-5);
}

export class Workbox {
  constructor(scriptUrl, options = {}) {
    this._scriptUrl = scriptUrl;
    this._options = options;
    this._registration = null;

    // If the page was loaded with a controlling service worker, let it know
    // the page is ready to receive messages.
    this._controllingSw = navigator.serviceWorker.controller;
    if (this._controllingSw) {
      this._notifyWindowReady(this._controllingSw);
    }

    // Bind methods.
    this._onSwInstalling = this._onSwInstalling.bind(this);
    this._onSwStateChage = this._onSwStateChage.bind(this);
    this._onControllerChangeAfterActivate =
        this._onControllerChangeAfterActivate.bind(this);

    // Add helper methods in non-production mode.
    if (process.env.NODE_ENV !== 'production') {
      this._isScriptUrlSameAsControllerUrl = () => {
        const scriptUrl = new URL(this._scriptUrl, document.baseURI);
        return scriptUrl.href === this._controllingSw.scriptURL;
      }
      this._isCurrentPageInSwScope = () => {
        const scopeUrl = new URL(
            this._options.scope || this._scriptUrl, document.baseURI);
        const scopeUrlBasePath = new URL('./', scopeUrl.href).pathname;
        return !location.pathname.includes(scopeUrlBasePath);
      }
    }
  }

  async register({immediate = false} = {}) {
    if (!immediate && document.readyState !== 'complete') {
      await new Promise((res) => addEventListener('load', res));
    }

    try {
      this._registration = await navigator.serviceWorker.register(
          this._scriptUrl, this._options);

      if (process.env.NODE_ENV !== 'production') {
        logger.log('Successfully registered service worker.');
        if (this._controllingSw) {
          if (this._isScriptUrlSameAsControllerUrl()) {
            logger.debug('A service worker with the same script URL is ' +
                'already controlling this page. This service worker will ' +
                'remain active unless an update is found.');
            logger.debug('Checking for update...');
          } else {
            logger.debug('A service worker with a different script URL is ' +
                'currently controlling the page.')
            logger.debug('Fetching the new script...');
          }
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        logger.error('Error registering service worker', error);
      }

      // Rethrow the error.
      throw error;
    }

    if (process.env.NODE_ENV !== 'production') {
      // If there's an active and waiting service worker before the
      // `updatefound` event fires, it means there was a waiting service worker
      // in the queue before this one was registered.
      if (this._registration.waiting && this._registration.active) {
        logger.warn('A service worker was already waiting to activate before ' +
            'this service worker was registered...');
      }

      if (this._isCurrentPageInSwScope()) {
        logger.warn('The current page is not in scope for the registered ' +
            'service worker. Was this a mistake?')
      }
    }

    this._registration.addEventListener('updatefound', this._onSwInstalling);

    // Expose the registration object.
    return this._registration;
  }

  _onSwInstalling() {
    this._sw = this._registration.installing;
    this._sw.addEventListener('statechange', this._onSwStateChage);

    if (process.env.NODE_ENV !== 'production') {
      if (this._controllingSw) {
        logger.log((this._isScriptUrlSameAsControllerUrl() ?
            'New' : 'Updated') + ' service worker found. Installing now...');
      } else {
        logger.log('Service worker is installing...');
      }
    }
  }

  _swInstalled() {
    if (process.env.NODE_ENV !== 'production') {
      logger.log('Service worker installed!');
    }
  }

  _swWaiting() {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('Service worker is installed but waiting for existing ' +
          'clients to close before activating...');
    }
  }

  _swActivated() {
    if (process.env.NODE_ENV !== 'production') {
      logger.log('Service worker is active!');
    }
  }

  _swControlling() {
    if (process.env.NODE_ENV !== 'production') {
      logger.log('Service worker is controlling the page.');
    }
  }

  _swActivatedButNotControlling() {
    if (process.env.NODE_ENV !== 'production') {
      logger.log('Service worker active, but not yet controlling the page. ' +
          'Reload the page or run `clients.claim()` in the service worker.');
    }
  }

  _newSwInstalled() {

  }

  _newSwWaiting() {

  }

  _newSwActive() {

  }

  _newSwControlling() {

  }

  _onSwStateChage() {
    switch (this._sw.state) {
      case 'installed':
        this._swInstalled();
        if (this._sw.state === 'installed' && this._registration.waiting) {

          // This timeout is used to ignore cases where the service worker calls `skipWaiting()`
          // in the install event, thus moving it directly in the activating state.
          // (Since all service workers *must* go through the waiting phase, the only way to
          // detect `skipWaiting()` called in the install event is to observe that
          // the time spent in the waiting phase is very short.)
          this._waitingTimeout = setTimeout(() => this._swWaiting(), 100);
        }
        break;
      case 'activating':
        clearTimeout(this._waitingTimeout);
        break;
      case 'activated':
        this._swActivated();

        if (this._sw === navigator.serviceWorker.controller) {
          this._swControlling();
        } else {
          this._swActivatedButNotControlling();
          navigator.serviceWorker.addEventListener('controllerchange',
              () => this._onControllerChangeAfterActivate(), {once: true});
        }
    }
  }

  _onControllerChangeAfterActivate() {
    if (this._sw === this._registration.active) {
      this._sw.addEventListener('statechange', () => {
        if (this._sw.state === 'activated') {
          this._swControlling();
        }
      }, {once: true});
    }
  }

  _notifyWindowReady(sw) {
    // sw.postMessage({

    // })
  }
}

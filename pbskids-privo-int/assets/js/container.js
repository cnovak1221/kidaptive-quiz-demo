/*! SpringRoll PBSKIDS Container 0.2.10 */
/*! Bellhop 1.2.0 */
(function(window)
{
	/**
	 * Generic event dispatcher
	 * @class  BellhopEventDispatcher
	 * @namespace springroll
	 */
	var BellhopEventDispatcher = function()
	{
		/**
		 *  The collection of event listeners
		 *  @property {Object} _listeners
		 *  @private
		 */
		this._listeners = {};
	};

	// Reference to prototype
	var p = BellhopEventDispatcher.prototype;

	/**
	 *  Add an event listener to the listen to an event from either the parent or iframe
	 *  @method on
	 *  @param {String|Object} type The type of event to listen for or a map of events to callbacks.
	 *         Multiple events can be added by separating events with spaces.
	 *  @param {Function} callback The handler when an event is triggered
	 *  @param {int} [priority=0] The priority of the event listener. Higher numbers are handled first.
	 *  @return {Bellhop} Return instance of current object
	 */
	p.on = function(type, callback, priority)
	{
		if (typeof type !== "string")
		{
			for (var t in type)
			{
				this.on(t, type[t], priority);
			}
		}
		else
		{
			var types = type.split(" ");
			var listener;
			for (var i = 0, len = types.length; i < len; i++)
			{
				type = types[i];

				listener = this._listeners[type];
				if (!listener)
					listener = this._listeners[type] = [];

				callback._priority = parseInt(priority) || 0;

				if (listener.indexOf(callback) === -1)
				{
					listener.push(callback);
					if (listener.length > 1)
						listener.sort(listenerSorter);
				}
			}
		}
		return this;
	};

	/**
	 *  Sorts listeners added by .on() by priority
	 */
	function listenerSorter(a, b)
	{
		return a._priority - b._priority;
	}

	/**
	 *  Remove an event listener
	 *  @method off
	 *  @param {String} type The type of event to listen for. If undefined, remove all listeners.
	 *  @param {Function} [callback] The optional handler when an event is triggered, if no callback
	 *         is set then all listeners by type are removed
	 *  @return {Bellhop} Return instance of current object
	 */
	p.off = function(type, callback)
	{
		if (type === undefined || !this._listeners)
		{
			//remove all listeners
			this._listeners = {};
			return this;
		}
		if (this._listeners[type] === undefined)
		{
			return this;
		}
		if (callback === undefined)
		{
			delete this._listeners[type];
		}
		else
		{
			var listeners = this._listeners[type];
			for (var i = 0, len = listeners.length; i < len; i++)
			{
				// Remove the listener
				if (listeners[i] === callback)
				{
					listeners.splice(i, 1);
					break;
				}
			}
		}
		return this;
	};

	/**
	 *  Trigger any event handlers for an event type
	 *  @method trigger
	 *  @private
	 *  @param {Object} event The event to send
	 */
	p.trigger = function(event)
	{
		if (typeof event == "string")
		{
			event = {
				type: event
			};
		}
		var listeners = this._listeners[event.type];
		if (listeners !== undefined)
		{
			for (var i = listeners.length - 1; i >= 0; i--)
			{
				listeners[i](event);
			}
		}
	};

	/**
	 * Destroy this object
	 * @method  destroy
	 */
	p.destroy = function()
	{
		this._listeners = null;
	};

	// Assign to namespace
	window.BellhopEventDispatcher = BellhopEventDispatcher;

}(window));
(function(window, undefined)
{
	// Include event dispatcher
	var BellhopEventDispatcher = window.BellhopEventDispatcher;

	/**
	 *  Abstract the communication layer between the iframe
	 *  and the parent DOM
	 *  @class Bellhop
	 *  @extends BellhopEventDispatcher
	 */
	var Bellhop = function()
	{
		BellhopEventDispatcher.call(this);

		/**
		 *  Bound handler for the window message event
		 *  @property {Function} onReceive
		 *  @private
		 */
		this.onReceive = this.receive.bind(this);

		/**
		 *  If we are connected to another instance of the bellhop
		 *  @property {Boolean} connected
		 *  @readOnly
		 *  @default false
		 *  @private
		 */
		this.connected = false;

		/**
		 *  The name of this Bellhop instance, useful for debugging purposes
		 *  @param {String} name
		 */
		this.name = '';

		/**
		 *  If this instance represents an iframe instance
		 *  @property {Boolean} isChild
		 *  @private
		 *  @default true
		 */
		this.isChild = true;

		/**
		 *  If we are current trying to connec
		 *  @property {Boolean} connecting
		 *  @default false
		 *  @private
		 */
		this.connecting = false;

		/**
		 *  If using cross-domain, the domain to post to
		 *  @property {Boolean} origin
		 *  @private
		 *  @default "*"
		 */
		this.origin = "*";

		/**
		 *  Save any sends to wait until after we're done
		 *  @property {Array} _sendLater
		 *  @private
		 */
		this._sendLater = [];

		/**
		 *  Do we have something to connect to, should be called after
		 *  attempting to `connect()`
		 *  @property {Boolean} supported
		 *  @readOnly
		 */
		this.supported = null;

		/**
		 * The iframe element
		 * @property {DOMElement} iframe
		 * @private
		 * @readOnly
		 */
		this.iframe = null;
	};

	// Reference to the prototype
	var s = BellhopEventDispatcher.prototype;
	var p = Bellhop.prototype = Object.create(s);

	/**
	 *  The connection has been established successfully
	 *  @event connected
	 */

	/**
	 *  Connection could not be established
	 *  @event failed
	 */

	/**
	 *  Handle messages in the window
	 *  @method receive
	 *  @private
	 */
	p.receive = function(event)
	{
		// Ignore events that don't originate from the target
		// we're connected to
		if (event.source !== this.target)
		{
			return;
		}

		var data = event.data;

		// This is the initial connection event
		if (data === 'connected')
		{
			this.connecting = false;
			this.connected = true;

			this.trigger('connected');

			// Be polite and respond to the child that we're ready
			if (!this.isChild)
			{
				this.target.postMessage(data, this.origin);
			}

			var i, len = this._sendLater.length;

			// If we have any sends waiting to send
			// we are now connected and it should be okay 
			if (len > 0)
			{
				for (i = 0; i < len; i++)
				{
					var e = this._sendLater[i];
					this.send(e.type, e.data);
				}
				this._sendLater.length = 0;
			}
		}
		else
		{
			// Ignore all other event if we don't have a context
			if (!this.connected) return;

			try
			{
				data = JSON.parse(data, Bellhop.reviver);
			}
			catch (err)
			{
				// If we can't parse the JSON
				// just ignore it, this should
				// only be an object
				return;
			}

			// Only valid objects with a type and matching channel id
			if (typeof data === "object" && data.type)
			{
				this.trigger(data);
			}
		}
	};

	/**
	 *  And override for the toString built-in method
	 *  @method toString
	 *  @return {String} Representation of this instance
	 */
	p.toString = function()
	{
		return "[Bellhop '" + this.name + "']";
	};

	/**
	 *  The target where to send messages
	 *  @property {DOM} target
	 *  @private
	 *  @readOnly
	 */
	Object.defineProperty(p, "target",
	{
		get: function()
		{
			return this.isChild ? window.parent : this.iframe.contentWindow;
		}
	});

	/**
	 *  Setup the connection
	 *  @method connect
	 *  @param {DOM} [iframe] The iframe to communicate with. If no value is set, the assumption
	 *         is that we're the child trying to communcate with our window.parent
	 *  @param {String} [origin="*"] The domain to communicate with if different from the current.
	 *  @return {Bellhop} Return instance of current object
	 */
	p.connect = function(iframe, origin)
	{
		// Ignore if we're already trying to connect
		if (this.connecting) return this;

		// Disconnect from any existing connection
		this.disconnect();

		// We are trying to connect
		this.connecting = true;

		//re-init if we had previously been destroyed
		if (!this._sendLater) this._sendLater = [];

		// The iframe if we're the parent
		this.iframe = iframe || null;

		// The instance of bellhop is inside the iframe
		var isChild = this.isChild = (iframe === undefined);
		var target = this.target;
		this.supported = isChild ? !!target && window != target : !!target;
		this.origin = origin === undefined ? "*" : origin;

		// Listen for incoming messages
		if (window.attachEvent)
		{
			window.attachEvent("onmessage", this.onReceive);
		}
		else
		{
			window.addEventListener("message", this.onReceive);
		}

		if (isChild)
		{
			// No parent, can't connect
			if (window === target)
			{
				this.trigger('failed');
			}
			else
			{
				// If connect is called after the window is ready
				// we can go ahead and send the connect message
				if (window.document.readyState === "complete")
				{
					target.postMessage('connected', this.origin);
				}
				else
				{
					// Or wait until the window is finished loading
					// then send the handshake to the parent
					window.onload = function()
					{
						target.postMessage('connected', this.origin);
					}.bind(this);
				}
			}
		}
		return this;
	};

	/**
	 *  Disconnect if there are any open connections
	 *  @method disconnect
	 */
	p.disconnect = function()
	{
		this.connected = false;
		this.connecting = false;
		this.origin = null;
		this.iframe = null;
		if (this._sendLater) this._sendLater.length = 0;
		this.isChild = true;

		if (window.detachEvent)
		{
			window.detachEvent("onmessage", this.onReceive);
		}
		else
		{
			window.removeEventListener("message", this.onReceive);
		}

		return this;
	};

	/**
	 *  Send an event to the connected instance
	 *  @method send
	 *  @param {String} event The event type to send to the parent
	 *  @param {Object} [data] Additional data to send along with event
	 *  @return {Bellhop} Return instance of current object
	 */
	p.send = function(event, data)
	{
		if (typeof event !== "string")
		{
			throw "The event type must be a string";
		}
		event = {
			type: event
		};

		// Add the additional data, if needed
		if (data !== undefined)
		{
			event.data = data;
		}
		if (this.connecting)
		{
			this._sendLater.push(event);
		}
		else if (!this.connected)
		{
			return this;
		}
		else
		{
			this.target.postMessage(JSON.stringify(event), this.origin);
		}
		return this;
	};

	/**
	 *  A convenience method for sending and the listening to create 
	 *  a singular link to fetching data. This is the same calling send
	 *  and then getting a response right away with the same event.
	 *  @method fetch
	 *  @param {String} event The name of the event
	 *  @param {Function} callback The callback to call after, takes event object as one argument
	 *  @param {Object} [data] Optional data to pass along
	 *  @param {Boolean} [runOnce=false] If we only want to fetch once and then remove the listener
	 *  @return {Bellhop} Return instance of current object
	 */
	p.fetch = function(event, callback, data, runOnce)
	{
		var self = this;

		if (!this.connecting && !this.connected)
		{
			throw "No connection, please call connect() first";
		}

		runOnce = runOnce === undefined ? false : runOnce;
		var internalCallback = function(e)
		{
			if (runOnce) self.off(e.type, internalCallback);
			callback(e);
		};
		this.on(event, internalCallback);
		this.send(event, data);
		return this;
	};

	/**
	 *  A convience method for listening to an event and then responding with some data
	 *  right away. Automatically removes the listener
	 *  @method respond
	 *  @param {String} event The name of the event
	 *  @param {Object} data The object to pass back. 
	 *  	May also be a function; the return value will be sent as data in this case.
	 *  @param {Boolean} [runOnce=false] If we only want to respond once and then remove the listener
	 *  @return {Bellhop} Return instance of current object
	 */
	p.respond = function(event, data, runOnce)
	{
		runOnce = runOnce === undefined ? false : runOnce;
		var self = this;
		var internalCallback = function(e)
		{
			if (runOnce) self.off(e.type, internalCallback);
			self.send(event, typeof data == "function" ? data() : data);
		};
		this.on(event, internalCallback);
		return this;
	};

	/**
	 *  Destroy and don't user after this
	 *  @method destroy
	 */
	p.destroy = function()
	{
		s.destroy.call(this);
		this.disconnect();
		this._sendLater = null;
	};

	/**
	 * When restoring from JSON via `JSON.parse`, we may pass a reviver function.
	 * In our case, this will check if the object has a specially-named property (`__classname`).
	 * If it does, we will attempt to construct a new instance of that class, rather than using a
	 * plain old Object. Note that this recurses through the object.
	 * See <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse">JSON.parse()</a>
	 * @method  reviver
	 * @static
	 * @param  {String} key   each key name
	 * @param  {Object} value Object that we wish to restore
	 * @return {Object}       The object that was parsed - either cast to a class, or not
	 */
	Bellhop.reviver = function(key, value)
	{
		if (value && typeof value.__classname == "string")
		{
			var _class = include(value.__classname);
			if (_class)
			{
				var rtn = new _class();
				//if we may call fromJSON, do so
				if (rtn.fromJSON)
				{
					rtn.fromJSON(value);
					//return the cast Object
					return rtn;
				}
			}
		}
		//return the object we were passed in
		return value;
	};

	/**
	 * Simple return function
	 * @method include
	 * @private
	 * @param {string} classname Qualified class name as a string.
	 *        for example "cloudkid.MyClass" would return a reference
	 *        to the function window.cloudkid.MyClass.
	 */
	var include = function(classname)
	{
		var parts = classname.split('.');
		var parent = window;
		while (parts.length)
		{
			parent = parent[parts.shift()];
			if (!parent) return;
		}
		return parent;
	};

	// Assign to the global namespace
	window.Bellhop = Bellhop;

}(window));
/*! SpringRoll Container 0.5.3 */
/**
 * @module Core
 * @namespace window
 */
(function(Object, support, undefined)
{

	/**
	 * Add methods to Object
	 * @class Object
	 */

	/**
	 * Merges two (or more) objects, giving the last one precedence
	 * @method merge
	 * @example
		var obj1 = { id : 'foo', name : 'Hello!', value : 100 };
		var obj2 = { id : 'bar', value : 200 };
		Object.merge({}, obj1, obj2); // Returns: { id : 'bar', name : 'Hello!', value : 200 }
	 * @static
	 * @param {Object} target The target object
	 * @param {Object} source* Additional objects to add
	 */
	Object.merge = function(target, source)
	{
		if (!target || typeof target !== 'object')
		{
			target = {};
		}

		for (var property in source)
		{
			if (source.hasOwnProperty(property))
			{
				var sourceProperty = source[property];

				if (typeof sourceProperty === 'object' && Object.isPlain(sourceProperty))
				{
					target[property] = Object.merge(target[property], sourceProperty);
					continue;
				}
				target[property] = sourceProperty;
			}
		}

		for (var i = 2, l = arguments.length; i < l; i++)
		{
			Object.merge(target, arguments[i]);
		}
		return target;
	};

	/**
	 * Check to see if an object is a plain object definition
	 * @method isPlain
	 * @static
	 * @param {Object} target The target object
	 * @return {Boolean} If the object is plain
	 */
	Object.isPlain = function(obj)
	{
		var key;
		var hasOwn = support.hasOwnProperty;

		// Must be an Object.
		// Because of IE, we also have to check the presence of the constructor property.
		// Make sure that DOM nodes and window objects don't pass through, as well
		if (!obj || typeof obj !== "object" || obj.nodeType || obj === window)
		{
			return false;
		}

		try
		{
			// Not own constructor property must be Object
			if (obj.constructor &&
				!hasOwn.call(obj, "constructor") &&
				!hasOwn.call(obj.constructor.prototype, "isPrototypeOf"))
			{
				return false;
			}
		}
		catch (e)
		{
			// IE8,9 Will throw exceptions on certain host objects #9897
			return false;
		}

		// Support: IE<9
		// Handle iteration over inherited properties before own properties.
		if (support.ownLast)
		{
			for (key in obj)
			{
				return hasOwn.call(obj, key);
			}
		}

		// Own properties are enumerated firstly, so to speed up,
		// if last one is own, then all properties are own.
		for (key in obj)
		{}

		return key === undefined || hasOwn.call(obj, key);
	};

	/**
	 * Creates a shallow copy of the object.
	 * @method clone
	 * @return {Object} The shallow copy.
	 */
	if (!Object.prototype.clone)
	{
		Object.defineProperty(Object.prototype, 'clone',
		{
			enumerable: false,
			writable: true,
			value: function()
			{
				var rtn = {};
				var thisObj = this;
				for (var key in thisObj)
				{
					rtn[key] = thisObj[key];
				}
				return rtn;
			}
		});
	}

}(Object,
{}));
/**
 * @module Core
 * @namespace window
 */
/**
 * Use to do class inheritence
 * @class extend
 * @static
 */
(function(window)
{

	// The extend function already exists
	if ("extend" in window) return;

	/**
	 * Extend prototype
	 *
	 * @example
		var p = extend(MyClass, ParentClass);
	 *
	 * @constructor
	 * @method extend
	 * @param {function} child The reference to the child class
	 * @param {function|String} [parent] The parent class reference or full classname
	 * @return {object} Reference to the child class's prototype
	 */
	window.extend = function(child, parent)
	{
		if (parent)
		{
			if (typeof parent == "string")
			{
				parent = window.include(parent);
			}
			var p = parent.prototype;
			child.prototype = Object.create(p);
			child.prototype.__parent = p;
		}
		// Add the constructor
		child.prototype.constructor = child;

		// Add extend to each class to easily extend
		// by calling MyClass.extend(SubClass)
		child.extend = function(subClass)
		{
			return window.extend(subClass, child);
		};
		return child.prototype;
	};

}(window));
/**
 * @module Core
 * @namespace window
 */
/**
 * Used to include required classes by name
 * @class include
 * @static
 */
(function(window, undefined)
{

	// The include function already exists
	if ("include" in window) return;

	/**
	 * Import a class
	 *
	 * @example
		var Application = include('springroll.Application');
	 *
	 * @constructor
	 * @method include
	 * @param {string} namespaceString Name space, for instance 'springroll.Application'
	 * @param {Boolean} [required=true] If the class we're trying to include is required.
	 * 		For classes that aren't found and are required, an error is thrown.
	 * @return {object|function} The object attached at the given namespace
	 */
	var include = function(namespaceString, required)
	{
		var parts = namespaceString.split('.'),
			parent = window,
			currentPart = '';

		required = required !== undefined ? !!required : true;

		for (var i = 0, length = parts.length; i < length; i++)
		{
			currentPart = parts[i];
			if (!parent[currentPart])
			{
				if (!required)
				{
					return null;
				}
				if (true)
				{
					throw "Unable to include '" + namespaceString + "' because the code is not included or the class needs to loaded sooner.";
				}
				else
				{
					throw "Unable to include '" + namespaceString + "'";
				}
			}
			parent = parent[currentPart];
		}
		return parent;
	};

	// Assign to the window namespace
	window.include = include;

}(window));
/**
 * @module Core
 * @namespace window
 */
/**
 * Static class for mixing in functionality into objects.
 * @class mixin
 * @static
 */
(function(window, Object)
{
	// The mixin function already exists
	if ("mixin" in window) return;

	/**
	 * Mixin functionality to an object
	 *
	 * @example
		mixin(instance, MyClass);
	 *
	 * @constructor
	 * @method mixin
	 * @param {*} target The instance object to add functionality to
	 * @param {function|String} superClass The parent reference or full classname
	 * @param {*} [args] Any additional arguments to pass to the constructor of the superClass
	 * @return {*} Return reference to target
	 */
	var mixin = function(target, superClass)
	{
		if (true && !superClass)
		{
			throw 'Did not supply a valid mixin class';
		}

		// Include using string
		if (typeof superClass === "string")
		{
			superClass = window.include(superClass);
		}

		// Check for existence of prototype
		if (!superClass.prototype)
		{
			if (true)
			{
				throw 'The mixin class does not have a valid protoype';
			}
			else
			{
				throw 'no mixin prototype';
			}
		}
		//loop over mixin prototype to add functions
		var p = superClass.prototype;

		for (var prop in p)
		{
			// For things that we set using Object.defineProperty
			// very important that enumerable:true for the 
			// defineProperty options
			var propDesc = Object.getOwnPropertyDescriptor(p, prop);
			if (propDesc)
			{
				Object.defineProperty(target, prop, propDesc);
			}
			else
			{
				// Should cover all other prototype methods/properties
				target[prop] = p[prop];
			}
		}
		// call mixin on target and apply any arguments
		superClass.apply(target, Array.prototype.slice.call(arguments, 2));
		return target;
	};

	// Assign to the window namespace
	window.mixin = mixin;

}(window, Object));
/**
 * @module Core
 * @namespace window
 */
/**
 * Static class for namespacing objects and adding
 * classes to it.
 * @class namespace
 * @static
 */
(function(window)
{

	// The namespace function already exists
	if ("namespace" in window) return;

	/**
	 * Create the namespace and assing to the window
	 *
	 * @example
		var SpriteUtils = function(){};
		namespace('springroll').SpriteUtils = SpriteUtils;
	 *
	 * @constructor
	 * @method namespace
	 * @param {string} namespaceString Name space, for instance 'springroll.utils'
	 * @return {object} The namespace object attached to the current window
	 */
	var namespace = function(namespaceString)
	{
		var parts = namespaceString.split('.'),
			parent = window,
			currentPart = '';

		for (var i = 0, length = parts.length; i < length; i++)
		{
			currentPart = parts[i];
			parent[currentPart] = parent[currentPart] ||
			{};
			parent = parent[currentPart];
		}
		return parent;
	};

	// Assign to the window namespace
	window.namespace = namespace;

}(window));
/**
 * @module Core
 * @namespace springroll
 */
(function(undefined)
{

	/**
	 * The EventDispatcher mirrors the functionality of AS3 and EaselJS's EventDispatcher,
	 * but is more robust in terms of inputs for the `on()` and `off()` methods.
	 *
	 * @class EventDispatcher
	 * @constructor
	 */
	var EventDispatcher = function()
	{
		/**
		 * The collection of listeners
		 * @property {Array} _listeners
		 * @private
		 */
		this._listeners = [];

		/**
		 * If the dispatcher is destroyed
		 * @property {Boolean} _destroyed
		 * @protected
		 */
		this._destroyed = false;
	};

	// Reference to the prototype
	var p = extend(EventDispatcher);

	/**
	 * If the dispatcher is destroyed
	 * @property {Boolean} destroyed
	 */
	Object.defineProperty(p, 'destroyed',
	{
		enumerable: true,
		get: function()
		{
			return this._destroyed;
		}
	});

	/**
	 * Dispatch an event
	 * @method trigger
	 * @param {String} type The type of event to trigger
	 * @param {*} arguments Additional parameters for the listener functions.
	 */
	p.trigger = function(type)
	{
		if (this._destroyed) return;

		if (this._listeners[type] !== undefined)
		{
			// copy the listeners array
			var listeners = this._listeners[type].slice();

			var args;

			if (arguments.length > 1)
			{
				args = Array.prototype.slice.call(arguments, 1);
			}

			for (var i = listeners.length - 1; i >= 0; --i)
			{
				var listener = listeners[i];
				if (listener._eventDispatcherOnce)
				{
					delete listener._eventDispatcherOnce;
					this.off(type, listener);
				}
				listener.apply(this, args);
			}
		}
	};

	/**
	 * Add an event listener but only handle it one time.
	 *
	 * @method once
	 * @param {String|object} name The type of event (can be multiple events separated by spaces),
	 *      or a map of events to handlers
	 * @param {Function|Array*} callback The callback function when event is fired or an array of callbacks.
	 * @param {int} [priority=0] The priority of the event listener. Higher numbers are handled first.
	 * @return {EventDispatcher} Return this EventDispatcher for chaining calls.
	 */
	p.once = function(name, callback, priority)
	{
		return this.on(name, callback, priority, true);
	};

	/**
	 * Add an event listener. The parameters for the listener functions depend on the event.
	 *
	 * @method on
	 * @param {String|object} name The type of event (can be multiple events separated by spaces),
	 *      or a map of events to handlers
	 * @param {Function|Array*} callback The callback function when event is fired or an array of callbacks.
	 * @param {int} [priority=0] The priority of the event listener. Higher numbers are handled first.
	 * @return {EventDispatcher} Return this EventDispatcher for chaining calls.
	 */
	p.on = function(name, callback, priority, once)
	{
		if (this._destroyed) return;

		// Callbacks map
		if (type(name) === 'object')
		{
			for (var key in name)
			{
				if (name.hasOwnProperty(key))
				{
					this.on(key, name[key], priority, once);
				}
			}
		}
		// Callback
		else if (type(callback) === 'function')
		{
			var names = name.split(' '),
				n = null;

			var listener;
			for (var i = 0, nl = names.length; i < nl; i++)
			{
				n = names[i];
				listener = this._listeners[n];
				if (!listener)
					listener = this._listeners[n] = [];

				if (once)
				{
					callback._eventDispatcherOnce = true;
				}
				callback._priority = parseInt(priority) || 0;

				if (listener.indexOf(callback) === -1)
				{
					listener.push(callback);
					if (listener.length > 1)
						listener.sort(listenerSorter);
				}
			}
		}
		// Callbacks array
		else if (Array.isArray(callback))
		{
			for (var f = 0, fl = callback.length; f < fl; f++)
			{
				this.on(name, callback[f], priority, once);
			}
		}
		return this;
	};

	function listenerSorter(a, b)
	{
		return a._priority - b._priority;
	}

	/**
	 * Remove the event listener
	 *
	 * @method off
	 * @param {String*} name The type of event string separated by spaces, if no name is specifed remove all listeners.
	 * @param {Function|Array*} callback The listener function or collection of callback functions
	 * @return {EventDispatcher} Return this EventDispatcher for chaining calls.
	 */
	p.off = function(name, callback)
	{
		if (this._destroyed) return;

		// remove all
		if (name === undefined)
		{
			this._listeners = [];
		}
		// remove multiple callbacks
		else if (Array.isArray(callback))
		{
			for (var f = 0, fl = callback.length; f < fl; f++)
			{
				this.off(name, callback[f]);
			}
		}
		else
		{
			var names = name.split(' ');
			var n = null;
			var listener;
			var index;
			for (var i = 0, nl = names.length; i < nl; i++)
			{
				n = names[i];
				listener = this._listeners[n];
				if (listener)
				{
					// remove all listeners for that event
					if (callback === undefined)
					{
						listener.length = 0;
					}
					else
					{
						//remove single listener
						index = listener.indexOf(callback);
						if (index !== -1)
						{
							listener.splice(index, 1);
						}
					}
				}
			}
		}
		return this;
	};

	/**
	 * Checks if the EventDispatcher has a specific listener or any listener for a given event.
	 *
	 * @method has
	 * @param {String} name The name of the single event type to check for
	 * @param {Function} [callback] The listener function to check for. If omitted, checks for any listener.
	 * @return {Boolean} If the EventDispatcher has the specified listener.
	 */
	p.has = function(name, callback)
	{
		if (!name) return false;

		var listeners = this._listeners[name];
		if (!listeners) return false;
		if (!callback)
			return listeners.length > 0;
		return listeners.indexOf(callback) >= 0;
	};

	/**
	 * Destroy and don't use after this
	 * @method destroy
	 */
	p.destroy = function()
	{
		this._destroyed = true;
		this._listeners = null;
	};

	/**
	 * Return type of the value.
	 *
	 * @private
	 * @method type
	 * @param  {*} value
	 * @return {String} The type
	 */
	function type(value)
	{
		if (value === null)
		{
			return 'null';
		}
		var typeOfValue = typeof value;
		if (typeOfValue === 'object' || typeOfValue === 'function')
		{
			return Object.prototype.toString.call(value).match(/\s([a-z]+)/i)[1].toLowerCase() || 'object';
		}
		return typeOfValue;
	}

	// Assign to name space
	namespace('springroll').EventDispatcher = EventDispatcher;

}());
/**
 * @module Core
 * @namespace springroll
 */
(function(global, doc, undefined)
{

	/**
	 * Handle the page visiblity change, if supported. Application uses one of these to
	 * monitor page visibility. It is suggested that you listen to `pause`, `paused`,
	 * or `resumed` events on the Application instead of using one of these yourself.
	 *
	 * @class PageVisibility
	 * @constructor
	 * @param {Function} onFocus Callback when the page becomes visible
	 * @param {Function} onBlur Callback when the page loses visibility
	 */
	var PageVisibility = function(onFocus, onBlur)
	{
		/**
		 * Callback when the page becomes visible
		 * @property {Function} _onFocus
		 * @private
		 */
		this._onFocus = onFocus;

		/**
		 * Callback when the page loses visibility
		 * @property {Function} _onBlur
		 * @private
		 */
		this._onBlur = onBlur;

		/**
		 * If this object is enabled.
		 * @property {Function} _enabled
		 * @private
		 */
		this._enabled = false;

		// If this browser doesn't support visibility
		if (!_visibilityChange && doc.onfocusin === undefined) return;

		/**
		 * The visibility toggle listener function
		 * @property {Function} _onToggle
		 * @private
		 */
		this._onToggle = function()
		{
			if (doc.hidden || doc.webkitHidden || doc.msHidden || doc.mozHidden)
				this._onBlur();
			else
				this._onFocus();
		}.bind(this);

		this.enabled = true;
	};

	// Reference to the prototype
	var p = extend(PageVisibility);

	/**
	 * The name of the visibility change event for the browser
	 *
	 * @property {String} _visibilityChange
	 * @private
	 */
	var _visibilityChange = null;

	// Select the visiblity change event name
	if (doc.hidden !== undefined)
	{
		_visibilityChange = "visibilitychange";
	}
	else if (doc.mozHidden !== undefined)
	{
		_visibilityChange = "mozvisibilitychange";
	}
	else if (doc.msHidden !== undefined)
	{
		_visibilityChange = "msvisibilitychange";
	}
	else if (doc.webkitHidden !== undefined)
	{
		_visibilityChange = "webkitvisibilitychange";
	}

	var isIE9 = !_visibilityChange && doc.onfocusin !== undefined;

	/**
	 * If this object is enabled.
	 * @property {Function} enabled
	 * @private
	 */
	Object.defineProperty(p, "enabled",
	{
		get: function()
		{
			return this._enabled;
		},
		set: function(value)
		{
			value = !!value;
			if (this._enabled == value) return;
			this._enabled = value;

			global.removeEventListener("pagehide", this._onBlur);
			global.removeEventListener("pageshow", this._onFocus);
			global.removeEventListener("blur", this._onBlur);
			global.removeEventListener("focus", this._onFocus);
			global.removeEventListener("visibilitychange", this._onToggle);
			doc.removeEventListener(_visibilityChange, this._onToggle, false);
			if (isIE9)
			{
				doc.removeEventListener("focusin", this._onFocus);
				doc.removeEventListener("focusout", this._onBlur);
			}

			if (value)
			{
				// Listen to visibility change
				// see https://developer.mozilla.org/en/API/PageVisibility/Page_Visibility_API
				doc.addEventListener(_visibilityChange, this._onToggle, false);
				// Listen for page events (when clicking the home button on iOS)
				global.addEventListener("pagehide", this._onBlur);
				global.addEventListener("pageshow", this._onFocus);
				global.addEventListener("blur", this._onBlur);
				global.addEventListener("focus", this._onFocus);
				global.addEventListener("visibilitychange", this._onToggle, false);
				//IE9 is old and uses its own events
				if (isIE9)
				{
					doc.addEventListener("focusin", this._onFocus);
					doc.addEventListener("focusout", this._onBlur);
				}
			}
		}
	});

	/**
	 * Disable the detection
	 * @method destroy
	 */
	p.destroy = function()
	{
		// If this browser doesn't support visibility
		if (!_visibilityChange || !this._onToggle) return;

		this.enabled = false;
		this._onToggle = null;
		this._onFocus = null;
		this._onBlur = null;
	};

	// Assign to the global space
	namespace('springroll').PageVisibility = PageVisibility;

}(window, document));
/**
 * @module Core
 * @namespace springroll
 */
(function(undefined)
{

	/**
	 * The SavedData functions use localStorage and sessionStorage, with a cookie fallback.
	 *
	 * @class SavedData
	 */
	var SavedData = {};

	/** 
	 * A constant to determine if we can use localStorage and 
	 * sessionStorage 
	 * @static
	 * @property {Boolean} WEB_STORAGE_SUPPORT
	 * @private
	 * @readOnly
	 */
	var WEB_STORAGE_SUPPORT = window.Storage !== undefined;

	/**
	 * A constant for cookie fallback for `SavedData.clear()` 
	 * @static
	 * @property {int} ERASE_COOKIE
	 * @private
	 * @readOnly
	 * @default -1
	 */
	var ERASE_COOKIE = -1;

	//in iOS, if the user is in Private Browsing, writing to localStorage throws an error.
	if (WEB_STORAGE_SUPPORT)
	{
		try
		{
			localStorage.setItem("LS_TEST", "test");
			localStorage.removeItem("LS_TEST");
		}
		catch (e)
		{
			WEB_STORAGE_SUPPORT = false;
		}
	}

	/**
	 * Remove a saved variable by name.
	 * @method remove
	 * @static
	 * @param {String} name The name of the value to remove
	 */
	SavedData.remove = function(name)
	{
		if (WEB_STORAGE_SUPPORT)
		{
			localStorage.removeItem(name);
			sessionStorage.removeItem(name);
		}
		else
			SavedData.write(name, "", ERASE_COOKIE);
	};

	/**
	 * Save a variable.
	 * @method write
	 * @static
	 * @param {String} name The name of the value to save
	 * @param {mixed} value The value to save. This will be run through JSON.stringify().
	 * @param {Boolean} [tempOnly=false] If the value should be saved only in the current browser session.
	 */
	SavedData.write = function(name, value, tempOnly)
	{
		if (WEB_STORAGE_SUPPORT)
		{
			if (tempOnly)
				sessionStorage.setItem(name, JSON.stringify(value));
			else
				localStorage.setItem(name, JSON.stringify(value));
		}
		else
		{
			var expires;
			if (tempOnly)
			{
				if (tempOnly !== ERASE_COOKIE)
					expires = ""; //remove when browser is closed
				else
					expires = "; expires=Thu, 01 Jan 1970 00:00:00 GMT"; //save cookie in the past for immediate removal
			}
			else
				expires = "; expires=" + new Date(2147483646000).toGMTString(); //THE END OF (32bit UNIX) TIME!

			document.cookie = name + "=" + escape(JSON.stringify(value)) + expires + "; path=/";
		}
	};

	/**
	 * Read the value of a saved variable
	 * @method read
	 * @static
	 * @param {String} name The name of the variable
	 * @return {mixed} The value (run through `JSON.parse()`) or null if it doesn't exist
	 */
	SavedData.read = function(name)
	{
		if (WEB_STORAGE_SUPPORT)
		{
			var value = localStorage.getItem(name) || sessionStorage.getItem(name);
			if (value)
				return JSON.parse(value, SavedData.reviver);
			else
				return null;
		}
		else
		{
			var nameEQ = name + "=",
				ca = document.cookie.split(';'),
				i = 0,
				c, len;

			for (i = 0, len = ca.length; i < len; i++)
			{
				c = ca[i];
				while (c.charAt(0) == ' ') c = c.substring(1, c.length);
				if (c.indexOf(nameEQ) === 0) return JSON.parse(unescape(c.substring(nameEQ.length, c.length)), SavedData.reviver);
			}
			return null;
		}
	};

	/**
	 * When restoring from JSON via `JSON.parse`, we may pass a reviver function.
	 * In our case, this will check if the object has a specially-named property (`__classname`).
	 * If it does, we will attempt to construct a new instance of that class, rather than using a
	 * plain old Object. Note that this recurses through the object.
	 * @method reviver
	 * @static
	 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse
	 * @param  {String} key   each key name
	 * @param  {Object} value Object that we wish to restore
	 * @return {Object}       The object that was parsed - either cast to a class, or not
	 */
	SavedData.reviver = function(key, value)
	{
		if (value && typeof value.__classname == "string")
		{
			var _class = include(value.__classname, false);
			if (_class)
			{
				var rtn = new _class();
				//if we may call fromJSON, do so
				if (rtn.fromJSON)
				{
					rtn.fromJSON(value);
					//return the cast Object
					return rtn;
				}
			}
		}
		//return the object we were passed in
		return value;
	};

	// Assign to the global space
	namespace('springroll').SavedData = SavedData;

}());
/**
 * @module Container
 * @namespace springroll
 */
(function()
{
	// Include class
	var SavedData = include('springroll.SavedData');

	/**
	 * Default user data handler for the {{#crossLink "springroll.Container"}}Container{{/crossLink}} to save data using
	 * the {{#crossLink "springroll.SavedData"}}SavedData{{/crossLink}} class.
	 * @class SavedDataHandler
	 */
	var SavedDataHandler = function() {};

	// Reference to prototype
	var p = extend(SavedDataHandler);

	/**
	 * Remove a data setting
	 * @method  remove
	 * @static
	 * @param  {String}   name  The name of the property
	 * @param  {Function} [callback] Callback when remove is complete
	 */
	p.remove = function(name, callback)
	{
		SavedData.remove(name);
		callback();
	};

	/**
	 * Write a custom setting
	 * @method  write
	 * @static
	 * @param  {String}  name  The name of the property
	 * @param {*} value The value to set the property to
	 * @param  {Function} [callback] Callback when write is complete
	 */
	p.write = function(name, value, callback)
	{
		SavedData.write(name, value);
		callback();
	};

	/**
	 * Read a custom setting
	 * @method  read
	 * @static
	 * @param  {String}  name  The name of the property
	 * @param  {Function} callback Callback when read is complete, returns the value
	 */
	p.read = function(name, callback)
	{
		callback(SavedData.read(name));
	};


	// Assign to namespace
	namespace('springroll').SavedDataHandler = SavedDataHandler;

}());
/**
 * @module Container
 * @namespace springroll
 */
(function(undefined)
{
	var Debug = include('springroll.Debug', false);

	/**
	 * Provide feature detection
	 * @class Features
	 */
	var Features = {};

	/**
	 * If the browser has flash
	 * @property {boolean} flash
	 */
	Features.flash = function()
	{
		var hasFlash = false;
		try
		{
			var fo = new ActiveXObject('ShockwaveFlash.ShockwaveFlash');
			if (fo)
			{
				hasFlash = true;
			}
		}
		catch (e)
		{
			if (navigator.mimeTypes &&
				navigator.mimeTypes['application/x-shockwave-flash'] !== undefined &&
				navigator.mimeTypes['application/x-shockwave-flash'].enabledPlugin)
			{
				hasFlash = true;
			}
		}
		return hasFlash;
	}();

	/**
	 * If the browser has WebGL support
	 * @property {boolean} webgl
	 */
	Features.webgl = function()
	{
		var canvas = document.createElement('canvas');
		if ('supportsContext' in canvas)
		{
			return canvas.supportsContext('webgl') ||
				canvas.supportsContext('experimental-webgl');
		}
		return !!window.WebGLRenderingContext;
	}();

	/**
	 * If the browser has Canvas support
	 * @property {boolean} canvas
	 */
	Features.canvas = function()
	{
		var elem = document.createElement('canvas');
		return !!(elem.getContext && elem.getContext('2d'));
	}();

	/**
	 * If the browser has WebAudio API support
	 * @property {boolean} webaudio
	 */
	Features.webaudio = function()
	{
		return 'webkitAudioContext' in window || 'AudioContext' in window;
	}();

	/**
	 * If the browser has Web Sockets API
	 * @property {boolean} websockets
	 */
	Features.websockets = function()
	{
		return 'WebSocket' in window || 'MozWebSocket' in window;
	}();

	/**
	 * If the browser has Geolocation API
	 * @property {boolean} geolocation
	 */
	Features.geolocation = function()
	{
		return 'geolocation' in navigator;
	}();

	/**
	 * If the browser has Web Workers API
	 * @property {boolean} webworkers
	 */
	Features.webworkers = function()
	{
		return !!window.Worker;
	}();

	/**
	 * If the browser has touch
	 * @property {boolean} touch
	 */
	Features.touch = function()
	{
		return !!(('ontouchstart' in window) || // iOS & Android
			(navigator.msPointerEnabled && navigator.msMaxTouchPoints > 0) || // IE10
			(navigator.pointerEnabled && navigator.maxTouchPoints > 0)); // IE11+
	}();

	/**
	 * Test for basic browser compatiliblity 
	 * @method basic
	 * @static
	 * @return {String} The error message, if fails
	 */
	Features.basic = function()
	{
		if (!Features.canvas)
		{
			return 'Browser does not support canvas';
		}
		else if (!Features.webaudio && !Features.flash)
		{
			return 'Browser does not support WebAudio or Flash audio';
		}
		return null;
	};

	/**
	 * See if the current bowser has the correct features
	 * @method test
	 * @static
	 * @param {object} capabilities The capabilities
	 * @param {object} capabilities.features The features
	 * @param {object} capabilities.features.webgl WebGL required
	 * @param {object} capabilities.features.geolocation Geolocation required
	 * @param {object} capabilities.features.webworkers Web Workers API required
	 * @param {object} capabilities.features.webaudio WebAudio API required
	 * @param {object} capabilities.features.websockets WebSockets required
	 * @param {object} capabilities.sizes The sizes
	 * @param {Boolean} capabilities.sizes.xsmall Screens < 480
	 * @param {Boolean} capabilities.sizes.small Screens < 768
	 * @param {Boolean} capabilities.sizes.medium Screens < 992
	 * @param {Boolean} capabilities.sizes.large Screens < 1200
	 * @param {Boolean} capabilities.sizes.xlarge Screens >= 1200
	 * @param {object} capabilities.ui The ui
	 * @param {Boolean} capabilities.ui.touch Touch capable
	 * @param {Boolean} capabilities.ui.mouse Mouse capable
	 * @return {String|null} The error, or else returns null
	 */
	Features.test = function(capabilities)
	{
		// check for basic compatibility
		var err = Features.basic();
		if (err)
		{
			return err;
		}
		var features = capabilities.features;
		var ui = capabilities.ui;
		var sizes = capabilities.sizes;

		for (var name in features)
		{
			if (Features[name] !== undefined)
			{
				// Failed built-in feature check
				if (features[name] && !Features[name])
				{
					return "Browser does not support " + name;
				}
				else
				{
					if (true && Debug)
						Debug.log("Browser has " + name);
				}
			}
			else
			{
				if (true && Debug)
					Debug.warn("The feature " + name + " is not supported");
			}
		}

		// Failed negative touch requirement
		if (!ui.touch && Features.touch)
		{
			return "Game does not support touch input";
		}

		// Failed mouse requirement
		if (!ui.mouse && !Features.touch)
		{
			return "Game does not support mouse input";
		}

		// Check the sizes
		var size = Math.max(window.screen.width, window.screen.height);

		if (!sizes.xsmall && size < 480)
		{
			return "Game doesn't support extra small screens";
		}
		if (!sizes.small && size < 768)
		{
			return "Game doesn't support small screens";
		}
		if (!sizes.medium && size < 992)
		{
			return "Game doesn't support medium screens";
		}
		if (!sizes.large && size < 1200)
		{
			return "Game doesn't support large screens";
		}
		if (!sizes.xlarge && size >= 1200)
		{
			return "Game doesn't support extra large screens";
		}
		return null;
	};

	if (true && Debug)
	{
		Debug.info("Browser Feature Detection" +
			("\n\tFlash support " + (Features.flash ? "\u2713" : "\u00D7")) +
			("\n\tCanvas support " + (Features.canvas ? "\u2713" : "\u00D7")) +
			("\n\tWebGL support " + (Features.webgl ? "\u2713" : "\u00D7")) +
			("\n\tWebAudio support " + (Features.webaudio ? "\u2713" : "\u00D7"))
		);
	}

	//Leak Features namespace
	namespace('springroll').Features = Features;

})();
/**
 * @module Container
 * @namespace springroll
 */
(function(document, undefined)
{
	//Import classes
	var EventDispatcher = include('springroll.EventDispatcher'),
		Features = include('springroll.Features'),
		Bellhop = include('Bellhop'),
		$ = include('jQuery');

	/**
	 * The application container
	 * @class Container
	 * @extends springroll.EventDispatcher
	 * @constructor
	 * @param {string} iframeSelector jQuery selector for application iframe container
	 * @param {object} [options] Optional parameteres
	 * @param {string} [options.helpButton] jQuery selector for help button
	 * @param {string} [options.captionsButton] jQuery selector for captions button
	 * @param {string} [options.soundButton] jQuery selector for captions button
	 * @param {string} [options.voButton] jQuery selector for vo button
	 * @param {string} [options.sfxButton] jQuery selector for sounf effects button
	 * @param {string} [options.musicButton] jQuery selector for music button
	 * @param {string} [options.pauseButton] jQuery selector for pause button
	 * @param {string} [options.pauseFocusSelector='.pause-on-focus'] The class to pause
	 *        the application when focused on. This is useful for form elements which
	 *        require focus and play better with Application's keepFocus option.
	 */
	var Container = function(iframeSelector, options)
	{
		EventDispatcher.call(this);

		/**
		 * The options
		 * @property {Object} options
		 * @readOnly
		 */
		this.options = options ||
		{};

		/**
		 * The name of this class
		 * @property {string} name
		 */
		this.name = 'springroll.Container';

		/**
		 * The current iframe jquery object
		 * @property {jquery} iframe
		 */
		this.main = $(iframeSelector);

		/**
		 * The DOM object for the iframe
		 * @property {Element} dom
		 */
		this.dom = this.main[0];

		/**
		 * Communication layer between the container and application
		 * @property {Bellhop} client
		 */
		this.client = null;

		/**
		 * The current release data
		 * @property {Object} release
		 */
		this.release = null;

		/**
		 * Check to see if a application is loaded
		 * @property {Boolean} loaded
		 * @readOnly
		 */
		this.loaded = false;

		/**
		 * Check to see if a application is loading
		 * @property {Boolean} loading
		 * @readOnly
		 */
		this.loading = false;

		// Bind close failed handler
		this._onCloseFailed = this._onCloseFailed.bind(this);

		// Setup plugins
		var plugins = Container._plugins;
		for (var i = 0; i < plugins.length; i++)
		{
			plugins[i].setup.call(this);
		}
	};

	/**
	 * The current version of the library
	 * @property {String} version
	 * @static
	 * @readOnly
	 * @default "0.5.3"
	 */
	Container.version = "0.5.3";

	//Reference to the prototype
	var s = EventDispatcher.prototype;
	var p = EventDispatcher.extend(Container);

	/**
	 * The collection of Container plugins
	 * @property {Array} _plugins
	 * @static
	 * @private
	 */
	Container._plugins = [];

	/**
	 * Open a application or path
	 * @method _internalOpen
	 * @protected
	 * @param {string} path The full path to the application to load
	 * @param {Object} [options] The open options
	 * @param {Boolean} [options.singlePlay=false] If we should play in single play mode
	 * @param {Object} [options.playOptions=null] The optional play options
	 */
	p._internalOpen = function(path, options)
	{
		options = $.extend(
		{
			singlePlay: false,
			playOptions: null
		}, options);

		this.reset();

		// Dispatch event for unsupported browsers
		// and then bail, don't continue with loading the application
		var err = Features.basic();
		if (err)
		{
			/**
			 * Fired when the application is unsupported
			 * @event unsupported
			 * @param {String} err The error message
			 */
			return this.trigger('unsupported', err);
		}

		this.loading = true;

		this.initClient();

		// Open plugins
		var plugins = Container._plugins;
		for (var i = 0; i < plugins.length; i++)
		{
			plugins[i].open.call(this);
		}

		//Open the application in the iframe
		this.main
			.addClass('loading')
			.prop('src', path);

		// Respond with data when we're ready
		this.client.respond('singlePlay', options.singlePlay);
		this.client.respond('playOptions', options.playOptions);

		/**
		 * Event when request to open an application has begin either by
		 * calling `openPath` or `openRemote`
		 * @event open
		 */
		this.trigger('open');
	};

	/**
	 * Open a application or path
	 * @method openPath
	 * @param {string} path The full path to the application to load
	 * @param {Object} [options] The open options
	 * @param {Boolean} [options.singlePlay=false] If we should play in single play mode
	 * @param {Object} [options.playOptions=null] The optional play options
	 */
	p.openPath = function(path, options, playOptions)
	{
		options = options ||
		{};

		// This should be deprecated, support for old function signature
		if (typeof options === "boolean")
		{
			options = {
				singlePlay: singlePlay,
				playOptions: playOptions
			};
		}
		this._internalOpen(path, options);
	};

	/**
	 * Set up communication layer between site and application.
	 * May be called from subclasses if they create/destroy Bellhop instances.
	 * @protected
	 * @method initClient
	 */
	p.initClient = function()
	{
		//Setup communication layer between site and application
		this.client = new Bellhop();
		this.client.connect(this.dom);

		//Handle bellhop events coming from the application
		this.client.on(
		{
			loading: onLoading.bind(this),
			loadDone: onLoadDone.bind(this), // @deprecated use 'loaded' instead
			loaded: onLoadDone.bind(this),
			endGame: onEndGame.bind(this),
			localError: onLocalError.bind(this)
		});
	};

	/**
	 * Removes the Bellhop communication layer altogether.
	 * @protected
	 * @method destroyClient
	 */
	p.destroyClient = function()
	{
		if (this.client)
		{
			this.client.destroy();
			this.client = null;
		}
	};

	/**
	 * Handle the local errors
	 * @method onLocalError
	 * @private
	 * @param  {Event} event Bellhop event
	 */
	var onLocalError = function(event)
	{
		this.trigger(event.type, event.data);
	};

	/**
	 * The game is starting to load
	 * @method onLoading
	 * @private
	 */
	var onLoading = function()
	{
		/**
		 * Event when a application start loading, first even received
		 * from the Application.
		 * @event opening
		 */
		this.trigger('opening');
	};

	/**
	 * Reset the mutes for audio and captions
	 * @method onLoadDone
	 * @private
	 */
	var onLoadDone = function()
	{
		this.loading = false;
		this.loaded = true;
		this.main.removeClass('loading');

		var plugins = Container._plugins;
		for (var i = 0; i < plugins.length; i++)
		{
			plugins[i].opened.call(this);
		}

		/**
		 * Event when the application gives the load done signal
		 * @event opened
		 */
		this.trigger('opened');
	};

	/**
	 * The application ended and destroyed itself
	 * @method onEndGame
	 * @private
	 */
	var onEndGame = function()
	{
		this.reset();
	};

	/**
	 * Reset all the buttons back to their original setting
	 * and clear the iframe.
	 * @method reset
	 */
	p.reset = function()
	{
		var wasLoaded = this.loaded || this.loading;

		// Destroy in the reverse priority order
		if (wasLoaded)
		{
			var plugins = Container._plugins;
			for (var i = plugins.length - 1; i >= 0; i--)
			{
				plugins[i].closed.call(this);
			}
		}

		// Remove bellhop instance
		this.destroyClient();

		// Reset state
		this.loaded = false;
		this.loading = false;

		// Clear the iframe src location
		this.main.attr('src', '')
			.removeClass('loading');

		if (wasLoaded)
		{
			this.off('localError', this._onCloseFailed);

			/**
			 * Event when a application closes
			 * @event closed
			 */
			this.trigger('closed');
		}
	};

	/**
	 * Tell the application to start closing
	 * @method close
	 */
	p.close = function()
	{
		if (this.loading || this.loaded)
		{
			var plugins = Container._plugins;
			for (var i = plugins.length - 1; i >= 0; i--)
			{
				plugins[i].close.call(this);
			}

			/**
			 * Event when a application starts closing
			 * @event close
			 */
			this.trigger('close');

			/**
			 * There was an uncaught iframe error destroying the game on closing
			 * @event localError
			 * @param {Error} error The error triggered
			 */
			this.once('localError', this._onCloseFailed);

			// Start the close
			this.client.send('close');
		}
		else
		{
			this.reset();
		}
	};

	/**
	 * If there was an error when closing, reset the container
	 * @method _onCloseFailed
	 * @private
	 */
	p._onCloseFailed = function()
	{
		this.reset(); // force close the app
	};

	/**
	 * Destroy and don't use after this
	 * @method destroy
	 */
	p.destroy = function()
	{
		this.reset();

		s.destroy.call(this);

		// Destroy in the reverse priority order
		var plugins = Container._plugins;
		for (var i = plugins.length - 1; i >= 0; i--)
		{
			plugins[i].teardown.call(this);
		}

		this.main = null;
		this.options = null;
		this.dom = null;
	};

	namespace('springroll').Container = Container;

}(document));
/**
 * @module Core
 * @namespace springroll
 */
(function()
{
	var Container;

	/**
	 * Responsible for creating properties, methods to 
	 * the SpringRoll Container when it's created.
	 *
	 *	var plugin = new ContainerPlugin();
	 *	plugin.setup = function()
	 *	{
	 *		// Do setup here
	 *	};
	 *
	 * @class ContainerPlugin
	 * @constructor
	 * @param {int} [priority=0] The priority, higher priority
	 *        plugins are setup, preloaded and destroyed first.
	 */
	var ContainerPlugin = function(priority)
	{
		if (!Container)
		{
			Container = include('springroll.Container');
		}

		/**
		 * The priority of the plugin. Higher numbers handled first. This should be set
		 * in the constructor of the extending ContainerPlugin.
		 * @property {int} priority
		 * @default 0
		 * @private
		 */
		this.priority = priority || 0;

		/**
		 * When the Container is being initialized. This function 
		 * is bound to the Container. This should be overridden.
		 * @method setup
		 */
		this.setup = function() {};

		/**
		 * Called when an application is opening and before the 
		 * app has completely finished loading.
		 * @method open 
		 */
		this.open = function() {};

		/**
		 * Called when an application is opening and before the 
		 * app has completely finished loading.
		 * @method opened 
		 */
		this.opened = function() {};

		/**
		 * Called when an application has begun to be closed.
		 * @method close 
		 */
		this.close = function() {};

		/**
		 * Called when an application is closed completely.
		 * @method closed
		 */
		this.closed = function() {};

		/**
		 * When the Container is being destroyed. This function 
		 * is bound to the Container. This should be overridden.
		 * @method teardown
		 */
		this.teardown = function() {};

		// Add the plugin to Container
		Container._plugins.push(this);
		Container._plugins.sort(function(a, b)
		{
			return b.priority - a.priority;
		});
	};

	// Assign to namespace
	namespace('springroll').ContainerPlugin = ContainerPlugin;

}());
/**
 * @module Container
 * @namespace springroll
 */
(function()
{
	var SavedData = springroll.SavedData;

	/**
	 * @class Container
	 */
	var plugin = new springroll.ContainerPlugin(100);

	plugin.setup = function()
	{
		/**
		 * Should we send bellhop messages for the mute (etc) buttons?
		 * @property {Boolean} sendMutes
		 * @default true
		 */
		this.sendMutes = true;

		/**
		 * Abstract method to handle the muting
		 * @method _setMuteProp
		 * @protected
		 * @param {string} prop The name of the property to save
		 * @param {jquery} button Reference to the jquery button
		 * @param {boolean} muted  If the button is muted
		 */
		this._setMuteProp = function(prop, button, muted)
		{
			button.removeClass('unmuted muted')
				.addClass(muted ? 'muted' : 'unmuted');

			SavedData.write(prop, muted);
			if (this.client && this.sendMutes)
			{
				this.client.send(prop, muted);
			}
		};

		/**
		 * Disable a button
		 * @method disableButton
		 * @private
		 * @param {jquery} button The button to disable
		 */
		this._disableButton = function(button)
		{
			button.removeClass('enabled')
				.addClass('disabled');
		};
	};

	plugin.teardown = function()
	{
		delete this._disableButton;
		delete this._setMuteProp;
		delete this.sendMutes;
	};

}());
/**
 * @module Container
 * @namespace springroll
 */
(function()
{
	var SavedData = include('springroll.SavedData');

	/**
	 * @class Container
	 */
	var plugin = new springroll.ContainerPlugin(70);

	/**
	 * The name of the saved property for the captions styles
	 * @property {string} CAPTIONS_STYLES
	 * @static
	 * @private
	 * @final
	 */
	var CAPTIONS_STYLES = 'captionsStyles';

	/**
	 * The map of the default caption style settings
	 * @property {object} DEFAULT_CAPTIONS_STYLES
	 * @static
	 * @private
	 * @final
	 */
	var DEFAULT_CAPTIONS_STYLES = {
		size: "md",
		background: "black-semi",
		color: "white",
		edge: "none",
		font: "arial",
		align: "top"
	};

	/**
	 * The name of the saved property if the captions are muted or not
	 * @property {string} CAPTIONS_MUTED
	 * @static
	 * @private
	 * @final
	 */
	var CAPTIONS_MUTED = 'captionsMuted';

	plugin.setup = function()
	{
		/**
		 * The collection of captions styles
		 * @property {string} _captionsStyles
		 * @private
		 */
		this._captionsStyles = Object.merge(
			{},
			DEFAULT_CAPTIONS_STYLES,
			SavedData.read(CAPTIONS_STYLES) ||
			{}
		);

		/**
		 * Reference to the captions button
		 * @property {jquery} captionsButton
		 */
		this.captionsButton = $(this.options.captionsButton)
			.click(function()
				{
					this.captionsMuted = !this.captionsMuted;
				}
				.bind(this));

		/**
		 * Set the captions are enabled or not
		 * @property {boolean} captionsMuted
		 * @default true
		 */
		Object.defineProperty(this, CAPTIONS_MUTED,
		{
			set: function(muted)
			{
				this._captionsMuted = muted;
				this._setMuteProp(CAPTIONS_MUTED, this.captionsButton, muted);
			},
			get: function()
			{
				return this._captionsMuted;
			}
		});

		/**
		 * Set the captions styles
		 * @method setCaptionsStyles
		 * @param {object|String} [styles] The style options or the name of the
		 * property (e.g., "color", "edge", "font", "background", "size")
		 * @param {string} [styles.color='white'] The text color, the default is white
		 * @param {string} [styles.edge='none'] The edge style, default is none
		 * @param {string} [styles.font='arial'] The font style, default is arial
		 * @param {string} [styles.background='black-semi'] The background style, black semi-transparent
		 * @param {string} [styles.size='md'] The font style default is medium
		 * @param {string} [styles.align='top'] The align style default is top of the window
		 * @param {string} [value] If setting styles parameter as a string, this is the value of the property.
		 */
		this.setCaptionsStyles = function(styles, value)
		{
			if (typeof styles === "object")
			{
				Object.merge(
					this._captionsStyles,
					styles ||
					{}
				);
			}
			else if (typeof styles === "string")
			{
				this._captionsStyles[styles] = value;
			}

			styles = this._captionsStyles;

			// Do some validation on the style settings
			if (true)
			{
				if (!styles.color || !/^(black|white|red|yellow|pink|blue)(-semi)?$/.test(styles.color))
				{
					throw "Setting captions color style is invalid value : " + styles.color;
				}
				if (!styles.background || !/^none|((black|white|red|yellow|pink|blue)(-semi)?)$/.test(styles.background))
				{
					throw "Setting captions background style is invalid value : " + styles.background;
				}
				if (!styles.size || !/^(xs|sm|md|lg|xl)$/.test(styles.size))
				{
					throw "Setting captions size style is invalid value : " + styles.size;
				}
				if (!styles.edge || !/^(raise|depress|uniform|drop|none)$/.test(styles.edge))
				{
					throw "Setting captions edge style is invalid value : " + styles.edge;
				}
				if (!styles.font || !/^(georgia|palatino|times|arial|arial-black|comic-sans|impact|lucida|tahoma|trebuchet|verdana|courier|console)$/.test(styles.font))
				{
					throw "Setting captions font style is invalid value : " + styles.font;
				}
				if (!styles.align || !/^(top|bottom)$/.test(styles.align))
				{
					throw "Setting captions align style is invalid value : " + styles.align;
				}
			}

			SavedData.write(CAPTIONS_STYLES, styles);
			if (this.client)
			{
				this.client.send(CAPTIONS_STYLES, styles);
			}
		};

		/**
		 * Get the captions styles
		 * @method getCaptionsStyles
		 * @param {string} [prop] The optional property, values are "size", "edge", "font", "background", "color"
		 * @return {object} The collection of styles, see setCaptionsStyles for more info.
		 */
		this.getCaptionsStyles = function(prop)
		{
			var styles = this._captionsStyles;
			return prop ? styles[prop] : styles;
		};

		/**
		 * Reset the captions styles
		 * @method clearCaptionsStyles
		 */
		this.clearCaptionsStyles = function()
		{
			this._captionsStyles = Object.merge(
			{}, DEFAULT_CAPTIONS_STYLES);
			this.setCaptionsStyles();
		};

		// Handle the features request
		this.on('features', function(features)
		{
			this.captionsButton.hide();
			if (features.captions) this.captionsButton.show();
		});

		//Set the defaults if we have none for the controls
		if (SavedData.read(CAPTIONS_MUTED) === null)
		{
			this.captionsMuted = true;
		}
	};

	plugin.opened = function()
	{
		this.captionsButton.removeClass('disabled');
		this.captionsMuted = !!SavedData.read(CAPTIONS_MUTED);
		this.setCaptionsStyles(SavedData.read(CAPTIONS_STYLES));
	};

	plugin.close = function()
	{
		this._disableButton(this.captionsButton);
	};

	plugin.teardown = function()
	{
		this.captionsButton.off('click');
		delete this.captionsButton;
		delete this._captionsStyles;
		delete this.getCaptionsStyles;
		delete this.setCaptionsStyles;
		delete this.clearCaptionsStyles;
		delete this._captionsMuted;
	};

}());
/**
 * @module Container
 * @namespace springroll
 */
(function()
{
	/**
	 * @class Container
	 */
	var plugin = new springroll.ContainerPlugin(90);

	plugin.open = function()
	{
		this._onFeatures = onFeatures.bind(this);
		this.client.on('features', this._onFeatures);
	};

	plugin.close = function()
	{
		this.client.off('features', this._onFeatures);
		delete this._onFeatures;
	};

	var onFeatures = function(event)
	{
		/**
		 * The features supported by the application
		 * @event features
		 * @param {Boolean} data.vo If VO vo context is supported
		 * @param {Boolean} data.music If music context is supported
		 * @param {Boolean} data.sound If Sound is supported
		 * @param {Boolean} data.sfx If SFX context is supported
		 * @param {Boolean} data.captions If captions is supported
		 * @param {Boolean} data.hints If hinting is supported
		 */
		this.trigger('features', event.data);
	};

}());
/**
 * @module Container
 * @namespace springroll
 */
(function()
{
	var PageVisibility = include('springroll.PageVisibility');

	/**
	 * @class Container
	 */
	var plugin = new springroll.ContainerPlugin(90);

	plugin.setup = function()
	{
		// Add the default option for pauseFocusSelector
		this.options = $.extend(
			{
				pauseFocusSelector: '.pause-on-focus'
			},
			this.options);

		/**
		 * Handle the page visiblity change events, like opening a new tab
		 * or blurring the current page.
		 * @property {springroll.PageVisibility} _pageVisibility
		 * @private
		 */
		this._pageVisibility = new PageVisibility(
			onContainerFocus.bind(this),
			onContainerBlur.bind(this)
		);

		/**
		 * Whether the Game is currently "blurred" (not focused) - for pausing/unpausing
		 * @property {Boolean} _appBlurred
		 * @private
		 * @default  false
		 */
		this._appBlurred = false;

		/**
		 * Always keep the focus on the application iframe
		 * @property {Boolean} _keepFocus
		 * @private
		 * @default  false
		 */
		this._keepFocus = false;

		/**
		 * Whether the Container is currently "blurred" (not focused) - for pausing/unpausing
		 * @property {Boolean} _containerBlurred
		 * @private
		 * @default  false
		 */
		this._containerBlurred = false;

		/**
		 * Delays pausing of application to mitigate issues with asynchronous communication
		 * between Game and Container
		 * @property {int} _focusTimer
		 */
		this._focusTimer = null;

		// Focus on the window on focusing on anything else
		// without the .pause-on-focus class
		this._onDocClick = onDocClick.bind(this);
		$(document).on('focus click', this._onDocClick);

		/**
		 * Focus on the iframe's contentWindow
		 * @method focus
		 */
		this.focus = function()
		{
			this.dom.contentWindow.focus();
		};

		/**
		 * Unfocus on the iframe's contentWindow
		 * @method blur
		 */
		this.blur = function()
		{
			this.dom.contentWindow.blur();
		};

		/**
		 * Manage the focus change events sent from window and iFrame
		 * @method manageFocus
		 * @protected
		 */
		this.manageFocus = function()
		{
			// Unfocus on the iframe
			if (this._keepFocus)
			{
				this.blur();
			}

			// we only need one delayed call, at the end of any
			// sequence of rapidly-fired blur/focus events
			if (this._focusTimer)
			{
				clearTimeout(this._focusTimer);
			}

			// Delay setting of 'paused' in case we get another focus event soon.
			// Focus events are sent to the container asynchronously, and this was
			// causing rapid toggling of the pause state and related issues,
			// especially in Internet Explorer
			this._focusTimer = setTimeout(
				function()
				{
					this._focusTimer = null;
					// A manual pause cannot be overriden by focus events.
					// User must click the resume button.
					if (this._isManualPause) return;

					this.paused = this._containerBlurred && this._appBlurred;

					// Focus on the content window when blurring the app
					// but selecting the container
					if (this._keepFocus && !this._containerBlurred && this._appBlurred)
					{
						this.focus();
					}

				}.bind(this),
				100
			);
		};

		// On elements with the class name pause-on-focus
		// we will pause the game until a blur event to that item
		// has been sent
		var self = this;
		$(this.options.pauseFocusSelector).on('focus', function()
		{
			self._isManualPause = self.paused = true;
			$(this).one('blur', function()
			{
				self._isManualPause = self.paused = false;
				self.focus();
			});
		});
	};

	/**
	 * When the document is clicked
	 * @method _onDocClicked
	 * @private
	 * @param  {Event} e Click or focus event
	 */
	var onDocClick = function(e)
	{
		if (!this.loaded) return;

		var target;

		// Firefox support
		if (e.originalEvent.explicitOriginalTarget)
		{
			target = $(e.originalEvent.explicitOriginalTarget);
		}
		else
		{
			target = $(e.target);
		}
		if (!target.filter(this.options.pauseFocusSelector).length)
		{
			this.focus();
		}
	};

	/**
	 * Handle the keep focus event for the window
	 * @method onKeepFocus
	 * @private
	 */
	var onKeepFocus = function(event)
	{
		this._keepFocus = !!event.data;
		this.manageFocus();
	};

	/**
	 * Handle focus events sent from iFrame children
	 * @method onFocus
	 * @private
	 */
	var onFocus = function(e)
	{
		this._appBlurred = !e.data;
		this.manageFocus();
	};

	/**
	 * Handle focus events sent from container's window
	 * @method onContainerFocus
	 * @private
	 */
	var onContainerFocus = function(e)
	{
		this._containerBlurred = false;
		this.manageFocus();
	};

	/**
	 * Handle blur events sent from container's window
	 * @method onContainerBlur
	 * @private
	 */
	var onContainerBlur = function(e)
	{
		//Set both container and application to blurred,
		//because some blur events are only happening on the container.
		//If container is blurred because application area was just focused,
		//the application's focus event will override the blur imminently.
		this._containerBlurred = this._appBlurred = true;
		this.manageFocus();
	};

	plugin.open = function()
	{
		this.client.on(
		{
			focus: onFocus.bind(this),
			keepFocus: onKeepFocus.bind(this),
		});
	};

	plugin.opened = function()
	{
		this.focus();
	};

	plugin.close = function()
	{
		// Stop the focus timer if it's running
		if (this._focusTimer)
		{
			clearTimeout(this._focusTimer);
		}
	};

	plugin.teardown = function()
	{
		$(this.options.pauseFocusSelector).off('focus');
		$(document).off('focus click', this._onDocClick);
		delete this._onDocClick;
		if (this._pageVisibility)
		{
			this._pageVisibility.destroy();
			delete this._pageVisibility;
		}
		delete this.focus;
		delete this.blur;
		delete this.manageFocus;
		delete this._appBlurred;
		delete this._focusTimer;
		delete this._keepFocus;
		delete this._containerBlurred;
	};

}());
/**
 * @module Container
 * @namespace springroll
 */
(function()
{
	/**
	 * @class Container
	 */
	var plugin = new springroll.ContainerPlugin(50);

	plugin.setup = function()
	{
		/**
		 * Reference to the help button
		 * @property {jquery} helpButton
		 */
		this.helpButton = $(this.options.helpButton)
			.click(function()
				{
					if (!this.paused && !this.helpButton.hasClass('disabled'))
					{
						this.client.send('playHelp');
					}
				}
				.bind(this));

		// Handle pause
		this.on('pause', function(paused)
		{
			// Disable the help button when paused if it's active
			if (paused && !this.helpButton.hasClass('disabled'))
			{
				this.helpButton.data('paused', true);
				this.helpEnabled = false;
			}
			else if (this.helpButton.data('paused'))
			{
				this.helpButton.removeData('paused');
				this.helpEnabled = true;
			}
		});

		/**
		 * Set the captions are muted
		 * @property {Boolean} helpEnabled
		 */
		Object.defineProperty(this, 'helpEnabled',
		{
			set: function(enabled)
			{
				this._helpEnabled = enabled;
				this.helpButton.removeClass('disabled enabled')
					.addClass(enabled ? 'enabled' : 'disabled');

				/**
				 * Fired when the enabled status of the help button changes
				 * @event helpEnabled
				 * @param {boolean} enabled If the help button is enabled
				 */
				this.trigger('helpEnabled', enabled);
			},
			get: function()
			{
				return this._helpEnabled;
			}
		});

		// Handle features changed
		this.on('features', function(features)
			{
				this.helpButton.hide();
				if (features.hints) this.helpButton.show();
			}
			.bind(this));
	};

	plugin.open = function()
	{
		this.client.on('helpEnabled', function(event)
			{
				this.helpEnabled = !!event.data;
			}
			.bind(this));
	};

	plugin.close = function()
	{
		this.client.off('helpEnabled');
		this.helpEnabled = false;
	};

	plugin.teardown = function()
	{
		this.helpButton.off('click');
		delete this.helpButton;
		delete this._helpEnabled;
	};

}());
/**
 * @module Container
 * @namespace springroll
 */
(function()
{
	/**
	 * @class Container
	 */
	var plugin = new springroll.ContainerPlugin(80);

	plugin.setup = function()
	{
		/**
		 * Reference to the pause application button
		 * @property {jquery} pauseButton
		 */
		this.pauseButton = $(this.options.pauseButton)
			.click(onPauseToggle.bind(this));

		/**
		 * If the application is currently paused manually
		 * @property {boolean} _isManualPause
		 * @private
		 * @default false
		 */
		this._isManualPause = false;

		/**
		 * If the current application is paused
		 * @property {Boolean} _paused
		 * @private
		 * @default false
		 */
		this._paused = false;

		/**
		 * If the current application is paused
		 * @property {Boolean} paused
		 * @default false
		 */
		Object.defineProperty(this, 'paused',
		{
			set: function(paused)
			{
				this._paused = paused;

				if (this.client)
				{
					this.client.send('pause', paused);
				}
				/**
				 * Fired when the pause state is toggled
				 * @event pause
				 * @param {boolean} paused If the application is now paused
				 */
				/**
				 * Fired when the application resumes from a paused state
				 * @event resumed
				 */
				/**
				 * Fired when the application becomes paused
				 * @event paused
				 */
				this.trigger(paused ? 'paused' : 'resumed');
				this.trigger('pause', paused);

				// Set the pause button state
				if (this.pauseButton)
				{
					this.pauseButton.removeClass('unpaused paused')
						.addClass(paused ? 'paused' : 'unpaused');
				}
			},
			get: function()
			{
				return this._paused;
			}
		});
	};

	/**
	 * Toggle the current paused state of the application
	 * @method onPauseToggle
	 * @private
	 */
	var onPauseToggle = function()
	{
		this.paused = !this.paused;
		this._isManualPause = this.paused;
	};

	plugin.opened = function()
	{
		this.pauseButton.removeClass('disabled');

		// Reset the paused state
		this.paused = this._paused;
	};

	plugin.close = function()
	{
		this._disableButton(this.pauseButton);
		this.paused = false;
	};

	plugin.teardown = function()
	{
		this.pauseButton.off('click');
		delete this.pauseButton;
		delete this._isManualPause;
		delete this._paused;
	};

}());
/**
 * @module Container
 * @namespace springroll
 */
(function()
{
	var $ = include('jQuery');
	var Features = include('springroll.Features');

	/**
	 * @class Container
	 */
	var plugin = new springroll.ContainerPlugin(30);

	plugin.setup = function()
	{
		/**
		 * The release object from SpringRoll Connect
		 * @property {Object} release
		 */
		this.release = null;

		/**
		 * Open application based on an API Call to SpringRoll Connect
		 * @method openRemote
		 * @param {string} api The path to API call, this can be a full URL
		 * @param {Object} [options] The open options
		 * @param {Boolean} [options.singlePlay=false] If we should play in single play mode
		 * @param {Object} [options.playOptions=null] The optional play options
		 * @param {String} [options.query=''] The application query string options (e.g., "?level=1")
		 */
		this.openRemote = function(api, options, playOptions)
		{
			// This should be deprecated, support for old function signature
			if (typeof options === "boolean")
			{
				options = {
					singlePlay: singlePlay,
					playOptions: playOptions
				};
			}
			options = $.extend(
			{
				query: '',
				playOptions: null,
				singlePlay: false
			}, options);

			this.release = null;

			$.getJSON(api, function(result)
					{
						if (this._destroyed) return;

						if (!result.success)
						{
							/**
							 * There was a problem with the API call
							 * @event remoteError
							 */
							return this.trigger('remoteError', result.error);
						}
						var release = result.data;

						var err = Features.test(release.capabilities);

						if (err)
						{
							return this.trigger('unsupported', err);
						}

						this.release = release;

						// Open the application
						this._internalOpen(release.url + options.query, options);
					}
					.bind(this))
				.fail(function()
					{
						if (this._destroyed) return;

						/**
						 * Fired when the API cannot be called
						 * @event remoteFailed
						 */
						return this.trigger('remoteFailed');
					}
					.bind(this));
		};
	};

	plugin.teardown = function()
	{
		delete this.openRemote;
		delete this.release;
	};

}());
/**
 * @module Container
 * @namespace springroll
 */
(function()
{
	var SavedData = include('springroll.SavedData');

	/**
	 * @class Container
	 */
	var plugin = new springroll.ContainerPlugin(60);

	/**
	 * The name of the saved property if the sound is muted or not
	 * @property {string} SOUND_MUTED
	 * @static
	 * @private
	 * @final
	 */
	var SOUND_MUTED = 'soundMuted';

	/**
	 * The name of the saved property if the music is muted or not
	 * @property {string} MUSIC_MUTED
	 * @static
	 * @private
	 * @final
	 */
	var MUSIC_MUTED = 'musicMuted';

	/**
	 * The name of the saved property if the voice-over is muted or not
	 * @property {string} VO_MUTED
	 * @static
	 * @private
	 * @final
	 */
	var VO_MUTED = 'voMuted';

	/**
	 * The name of the saved property if the effects are muted or not
	 * @property {string} SFX_MUTED
	 * @static
	 * @private
	 * @final
	 */
	var SFX_MUTED = 'sfxMuted';

	plugin.setup = function()
	{
		/**
		 * Reference to the all sound mute button
		 * @property {jquery} soundButton
		 */
		this.soundButton = $(this.options.soundButton)
			.click(onSoundToggle.bind(this));

		/**
		 * Reference to the music mute button
		 * @property {jquery} musicButton
		 */
		this.musicButton = $(this.options.musicButton)
			.click(onMusicToggle.bind(this));

		/**
		 * Reference to the sound effects mute button
		 * @property {jquery} sfxButton
		 */
		this.sfxButton = $(this.options.sfxButton)
			.click(onSFXToggle.bind(this));

		/**
		 * Reference to the voice-over mute button
		 * @property {jquery} voButton
		 */
		this.voButton = $(this.options.voButton)
			.click(onVOToggle.bind(this));

		/**
		 * Check for when all mutes are muted or unmuted
		 * @method _checkSoundMute
		 * @private
		 */
		this._checkSoundMute = function()
		{
			this.soundMuted = this.sfxMuted && this.voMuted && this.musicMuted;
		};

		/**
		 * Set the all sound is enabled or not
		 * @property {boolean} soundMuted
		 * @default false
		 */
		Object.defineProperty(this, SOUND_MUTED,
		{
			set: function(muted)
			{
				this._soundMuted = muted;
				this._setMuteProp(SOUND_MUTED, this.soundButton, muted);
			},
			get: function()
			{
				return this._soundMuted;
			}
		});

		/**
		 * Set the voice-over audio is muted
		 * @property {boolean} voMuted
		 * @default true
		 */
		Object.defineProperty(this, VO_MUTED,
		{
			set: function(muted)
			{
				this._voMuted = muted;
				this._setMuteProp(VO_MUTED, this.voButton, muted);
			},
			get: function()
			{
				return this._voMuted;
			}
		});

		/**
		 * Set the music audio is muted
		 * @property {boolean} musicMuted
		 * @default true
		 */
		Object.defineProperty(this, MUSIC_MUTED,
		{
			set: function(muted)
			{
				this._musicMuted = muted;
				this._setMuteProp(MUSIC_MUTED, this.musicButton, muted);
			},
			get: function()
			{
				return this._musicMuted;
			}
		});

		/**
		 * Set the sound effect audio is muted
		 * @property {boolean} sfxMuted
		 * @default true
		 */
		Object.defineProperty(this, SFX_MUTED,
		{
			set: function(muted)
			{
				this._sfxMuted = muted;
				this._setMuteProp(SFX_MUTED, this.sfxButton, muted);
			},
			get: function()
			{
				return this._sfxMuted;
			}
		});

		//Set the defaults if we have none for the controls
		if (SavedData.read(SOUND_MUTED) === null)
		{
			this.soundMuted = false;
		}

		this.on('features', function(features)
			{
				this.voButton.hide();
				this.musicButton.hide();
				this.soundButton.hide();
				this.sfxButton.hide();

				if (features.vo) this.voButton.show();
				if (features.music) this.musicButton.show();
				if (features.sound) this.soundButton.show();
				if (features.sfxButton) this.sfxButton.show();
			}
			.bind(this));
	};

	/**
	 * Handler when the sound mute button is clicked
	 * @method onSoundToggle
	 * @private
	 */
	var onSoundToggle = function()
	{
		var muted = !this.soundMuted;
		this.soundMuted = muted;
		this.musicMuted = muted;
		this.voMuted = muted;
		this.sfxMuted = muted;
	};

	/**
	 * Handler when the music mute button is clicked
	 * @method onMusicToggle
	 * @private
	 */
	var onMusicToggle = function()
	{
		this.musicMuted = !this.musicMuted;
		this._checkSoundMute();
	};

	/**
	 * Handler when the voice-over mute button is clicked
	 * @method onVOToggle
	 * @private
	 */
	var onVOToggle = function()
	{
		this.voMuted = !this.voMuted;
		this._checkSoundMute();
	};

	/**
	 * Handler when the voice-over mute button is clicked
	 * @method onSFXToggle
	 * @private
	 */
	var onSFXToggle = function()
	{
		this.sfxMuted = !this.sfxMuted;
		this._checkSoundMute();
	};

	plugin.open = function() {};

	plugin.opened = function()
	{
		this.soundButton.removeClass('disabled');
		this.sfxButton.removeClass('disabled');
		this.voButton.removeClass('disabled');
		this.musicButton.removeClass('disabled');

		this.soundMuted = !!SavedData.read(SOUND_MUTED);
		this.musicMuted = !!SavedData.read(MUSIC_MUTED);
		this.sfxMuted = !!SavedData.read(SFX_MUTED);
		this.voMuted = !!SavedData.read(VO_MUTED);
	};

	plugin.close = function()
	{
		this._disableButton(this.soundButton);
		this._disableButton(this.musicButton);
		this._disableButton(this.voButton);
		this._disableButton(this.sfxButton);
	};

	plugin.teardown = function()
	{
		this.voButton.off('click');
		this.sfxButton.off('click');
		this.musicButton.off('click');
		this.soundButton.off('click');
		delete this.voButton;
		delete this.sfxButton;
		delete this.musicButton;
		delete this.soundButton;
		delete this._checkSoundMute;
	};

}());
/**
 * @module Container
 * @namespace springroll
 */
(function()
{
	var SavedDataHandler = include('springroll.SavedDataHandler');

	/**
	 * @class Container
	 */
	var plugin = new springroll.ContainerPlugin(40);

	plugin.setup = function()
	{
		/**
		 * The external handler class, must include `remove`, `write`, `read` methods
		 * make it possible to use something else to handle the external, default
		 * is to use cookies/localStorage. See {{#crossLink "springroll.SavedDataHandler"}}{{/crossLink}}
		 * as an example.
		 * @property {Object} userDataHandler
		 * @default springroll.SavedDataHandler
		 */
		this.userDataHandler = new SavedDataHandler();
	};

	plugin.open = function()
	{
		this.client.on(
		{
			userDataRemove: onUserDataRemove.bind(this),
			userDataRead: onUserDataRead.bind(this),
			userDataWrite: onUserDataWrite.bind(this),
		});
	};

	/**
	 * Handler for the userDataRemove event
	 * @method onUserDataRemove
	 * @private
	 */
	var onUserDataRemove = function(event)
	{
		var client = this.client;
		this.userDataHandler.remove(event.data, function()
		{
			client.send(event.type);
		});
	};

	/**
	 * Handler for the userDataRead event
	 * @method onUserDataRead
	 * @private
	 */
	var onUserDataRead = function(event)
	{
		var client = this.client;
		this.userDataHandler.read(event.data, function(value)
		{
			client.send(event.type, value);
		});
	};

	/**
	 * Handler for the userDataWrite event
	 * @method onUserDataWrite
	 * @private
	 */
	var onUserDataWrite = function(event)
	{
		var data = event.data;
		var client = this.client;
		this.userDataHandler.write(data.name, data.value, function()
		{
			client.send(event.type);
		});
	};

	plugin.teardown = function()
	{
		this.userDataHandler = null;
	};

}());
/*! Kart Kingdom Minigame API v2.0.2 Copyright (c) 1995-2016 PBSKIDS.org */
/*! Kart Kingdom Avatar Renderer v1.0.0 Copyright (c) 1995-2016 PBSKIDS.org */
/*! Kart Kingdom Minigame Cheator v1.0.0 Copyright (c) 1995-2016 PBSKIDS.org */

/*! Source: src/kartkingdom.cheator.js*/
(function(){
	'use strict';
	var _APP_NAME = "Kart Kingdom Minigame Cheator";
	var _APP_VERS = "1.0.0";
	var _DEBUG = window.location.hostname.match(/^((?!(www|springroll)(\-tc)?\.).+)pbskids\.org$/) ? true : false;
	var _log = function(message, args, type, force){
		if( _DEBUG === true || force === true ){
			if( typeof message === "string" || !!args ){
				message = _APP_NAME + " ver. " + _APP_VERS + " | " + message;
			}
			else{
				args = message;
				message = _APP_NAME + " ver. " + _APP_VERS + " | ";
			}

			if(typeof console!=="undefined"){
				if(type === "error" && console.error){
					console.error(message,args);
				}
				else if(type === "error" && window.Error){
					throw new Error(message);
				}
				else if(type === "info" && console.info){
					console.info(message,args);
				}
				else if(type === "warn" && console.warn){
					console.warn(message,args);
				}
				else if(console.log){
					console.log(message,args);
				}
				else if(typeof window.debug !== "undefined"){
					window.debug.log.apply(message,args);
				}
			}
		}
	};

	var _createPackage = function(packagePath) {
		var dir, pak = typeof exports !== "undefined" ? exports : window;
		if (typeof packagePath === "string") {
			dir = packagePath.split(".");
			for (var i in dir) {
				if (!pak[dir[i]]){
					pak[dir[i]] = {};
				}
				pak = pak[dir[i]];
			}
		}
		return pak;
	};

	(function(factory){
		// create top-level object
		_createPackage("PBS.KIDS.KartKingdom");

		// capture PBSKIDS define and require methods
		var define = PBS.KIDS.define;
		var require = PBS.KIDS.require;

		// Check for AMD Support AND if this file was loaded using require()
		if (typeof define === "function" && define.amd && typeof require === "function" && require.specified && require.specified("kartkingdom/cheator")){
			define('kartkingdom/cheator', [], function(){
				// construct PBS.KIDS.KartKingdom as a browser global and return it to require.js
				_log("Has AMD Support");
				PBS.KIDS.KartKingdom.cheator = factory();
				return PBS.KIDS.KartKingdom.cheator;
			});
		}
		else{
			// construct browser global
			_log("NO AMD Support found");
			PBS.KIDS.KartKingdom.cheator = factory();
		}
	}(function(){
		PBS.KIDS.KartKingdom.cheator = function($, gameAPI, gameID, gameWrapper, options){
			var _PBS_DOMAIN = _DEBUG ? "http://" + window.location.hostname : "http://www-tc.pbskids.org";
			var _GAME_INFO_API = _PBS_DOMAIN + "/go/apps/kartkingdom/game/";
			var _that = this;
			var xhr_gameInfo;

			// Capture the target window, e.g iframe in springroll container.
			var target = options ? options.target || window : window;
			_log("target = ", target);

			var onToggleCheatingDashboard = function(){
				$("#kartkingdom-cheator").toggleClass("open");
			};

			var onKeyDown = function(e){
				// If key combo = i+ctrl
				if (e.keyCode === 73 && e.ctrlKey){
					onToggleCheatingDashboard(e);
				}
			};

			var onMiniGameReady = function(e){
				$("#cheator-player-status")
					.append(
						$("<li/>")
						.toggleClass("passed", e.is_logged_in)
						.html(e.is_logged_in ? "Player Is Logged In" : "Player Is NOT Logged In")
					)
					.append(
						$("<li/>")
						.toggleClass("passed", e.has_played_virtual_world)
						.html(e.has_played_virtual_world ? "Has Virtual World Access" : "No Virtual World Access")
					);
			};

			var onClickCheatEvent = function(){
				gameAPI.event($(this).data("event-id"));
			};

			var onClickLevelComplete = function(){
				gameAPI.levelComplete();
			};

			var finalize = function(response){
				_log("Loaded Game Info");

				if (!response || !response.name){
					$('#cheating-game-name').html('Could not find a game with the guid, "' + gameID + '"').addClass("error");
					_log("Failed to Complete Cheating Dashboard | No Game Found");
					return;
				}

				if (!response.events){
					$('#cheating-game-name').html('"' + response.name + '", does not have events').addClass("error");
					_log("Failed to Complete Cheating Dashboard | Game Has No Events");
					return;
				}

				//Update Cheating Dashboard Game Info
				$('#cheating-game-name').html(response.name);

				//Add Event Buttons
				$('#cheator-dashboard').append(
						$("<button id='cheator-level-complete-button'/>")
						.html("COMPLETE LEVEL")
						.on("click", onClickLevelComplete)
					)
					.append($("<ul id='cheator-player-status'/>"))
					.append($("<div id='cheating-event-buttons'/>"));

				for (var i = 0; i < response.events.length; i++){
					$("#cheating-event-buttons").append(
						$("<button/>")
						.html(response.events[i].name)
						.data("event-id", response.events[i].guid)
						.on("click", onClickCheatEvent)
					);
				}

				//Get and Display Player Data
				gameAPI.addEventListener("pbskids_kartkingdom_minigameEvent_MinigameReady", onMiniGameReady);

				_log("Cheating Dashboard Completed Successfully");

			}; //finalize()

			var destroy = function(){
				// Abort all active ajax requests
				_log("Abort all active ajax requests and timeouts");
				if( xhr_gameInfo ) {
					xhr_gameInfo.abort();
				}

				// Remove event listeners
				_log("Remove event listeners");
				gameAPI.addEventListener("pbskids_kartkingdom_minigameEvent_MinigameReady", onMiniGameReady);
				$(target.document).off("keydown", onKeyDown);

				// Disable public methods
				_log("Disable public methods");
				for( var prop in _that ){
					if( _that.hasOwnProperty(prop) && typeof(_that[prop]) === "function" ){
						_that[prop] = function(){ return false; };
					}
				}

				// Remove elements along with bound events and associated data
				_log("Destroy elements");
				$("#kartkingdom-cheator").remove();

				// Remove css styles written to document
				_log("Remove dependencies");
				$("#kartkingdom-api-cheator-css").remove();

				// Null all the things!!!
				_log("Null all the things!!!");
				$ = gameAPI = gameID = gameWrapper = options = null;

				_log("CHEATING DASHBOARD DESTROYED");

			}; //destroy()

			(function(){ //init
				_log("Build Cheating Dashboard");

				$("<div id='kartkingdom-cheator' />")
					.append(
						$("<button id='cheator-toggle-dashboard'/>").on("click", onToggleCheatingDashboard)
					)
					.append(
						$("<div id='cheator-dashboard' />")
						.append(
							$("<h2 id='cheating-game-name'/>")
							.html("Loading Game Events...")
						)
					)
					.appendTo(gameWrapper);

				var cheatorDock = (options.dock === "BL" || options.dock === "BR") ? "top" : "bottom";

				//Add Styles for Cheating Dashboard to Document Head
				var styles = "#kartkingdom-cheator{ position: absolute; z-index: 900; right: 0; " + cheatorDock + ": 0; width:auto; font-family: Arial; }";
				styles += "#cheator-dashboard{ display: none; background: rgba(0, 0, 0, 0.75); padding: 0 32px 0.8em 0.8em; }";
				styles += "#cheator-toggle-dashboard{ position: absolute; " + cheatorDock + ": 10px; right: 8px; border: none; background: rgba(0, 0, 0, 0.75); color: white; border-radius: 8px; cursor: pointer; height: 32px; }";
				styles += "#cheator-toggle-dashboard:before{ content:'CHEAT'; }";
				styles += "#cheator-toggle-dashboard:focus{ outline:none; }";
				styles += "#cheating-game-name{ font-size: 24px; display: inline-block; color: #FFFFFF; margin: 10px; vertical-align: middle; }";
				styles += "#cheating-game-name.error{ font-size: 18px; color: rgb(255, 0 , 0); }";
				styles += "#cheator-player-status{ list-style: none; margin: 10px; padding: 0px; color: rgb(255, 0, 0); font-size: 11px; display: inline-block; vertical-align: middle; text-transform: uppercase; }";
				styles += "#cheator-player-status li{ margin: 5px 0; display: block; }";
				styles += "#cheator-player-status li.passed{ color: rgb(0, 255, 0); }";
				styles += "#cheator-level-complete-button{ margin: 10px; width: 150px; height: 30px; border: none; border-radius: 9px; cursor: pointer; outline: none; color: rgb(140, 0, 0); background: white; font-size: 14px; font-weight: bold; }";
				styles += "#cheating-event-buttons button{ margin: 8px 8px 0px; width: 100px; height: 32px; font-size: 11px; border: none; border-radius: 8px; cursor: pointer; outline: none; background: #FFFFFF; vertical-align: middle; }";
				styles += "#kartkingdom-cheator.open{ width:100%; }";
				styles += "#kartkingdom-cheator.open #cheator-dashboard{ display:block; }";
				styles += "#kartkingdom-cheator.open #cheator-toggle-dashboard{ background: rgba(255, 0, 0, 1); width: 32px; bottom: auto; top: 10px; }";
				styles += "#kartkingdom-cheator.open #cheator-toggle-dashboard:before{ content: '\\00d7'; font-size: 32px; margin-top: -8px; display: block; }";
				$("<style id='kartkingdom-api-cheator-css'>").attr("type", "text/css").appendTo("head").html(styles);

				//Bind keyboard command for openning/closing dashboard
				$(target.document).on("keydown", onKeyDown);

				//Load game info and finish building dashboard
				xhr_gameInfo = $.ajax({
					url: _GAME_INFO_API + gameID,
					success: finalize,
					error: finalize
				});

			}()); //init()

			// Public Methods
			this.destroy = function(){
				destroy();
			};

		}; //PBS.KIDS.KartKingdom.cheator()

		//Assign to namespace
		if( typeof(namespace) === "function" ){
			namespace("springroll.pbskids.kartkingdom").Cheator = PBS.KIDS.KartKingdom.cheator;
		}

		return PBS.KIDS.KartKingdom.cheator;
	}));
}());

/*! Source: src/kartkingdom.avatar.js*/
(function(){
	'use strict';
	var _APP_NAME = "Kart Kingdom Avatar Renderer";
	var _APP_VERS = "1.0.0";
	var _DEBUG = window.location.hostname.match(/^((?!(www|springroll)(\-tc)?\.).+)pbskids\.org$/) ? true : false;
	var _log = function(message, args, type, force){
		if( _DEBUG === true || force === true ){
			if( typeof message === "string" || !!args ){
				message = _APP_NAME + " ver. " + _APP_VERS + " | " + message;
			}
			else{
				args = message;
				message = _APP_NAME + " ver. " + _APP_VERS + " | ";
			}

			if(typeof console!=="undefined"){
				if(type === "error" && console.error){
					console.error(message,args);
				}
				else if(type === "error" && window.Error){
					throw new Error(message);
				}
				else if(type === "info" && console.info){
					console.info(message,args);
				}
				else if(type === "warn" && console.warn){
					console.warn(message,args);
				}
				else if(console.log){
					console.log(message,args);
				}
				else if(typeof window.debug !== "undefined"){
					window.debug.log.apply(message,args);
				}
			}
		}
	};

	var _createPackage = function(packagePath) {
		var dir, pak = typeof exports !== "undefined" ? exports : window;
		if (typeof packagePath === "string") {
			dir = packagePath.split(".");
			for (var i in dir) {
				if (!pak[dir[i]]){
					pak[dir[i]] = {};
				}
				pak = pak[dir[i]];
			}
		}
		return pak;
	};

	var _getCookie = function(c_name) {
		if (document.cookie.length > 0) {
			var c_end, c_start = document.cookie.indexOf(c_name + "=");
			if (c_start !== -1) {
				c_start = c_start + c_name.length + 1;
				c_end = document.cookie.indexOf(";", c_start);
				if (c_end === -1){
					c_end = document.cookie.length;
				}
				return decodeURI(document.cookie.substring(c_start, c_end));
			}
		}
		return "";
	};

	(function( factory ){
		//create top-level object
		_createPackage("PBS.KIDS.KartKingdom");

		//capture PBSKIDS define and require methods
		var define  = PBS.KIDS.define;
		var require = PBS.KIDS.require;

		//Check for AMD Support AND if this file was loaded using require()
		if( typeof define === "function" && define.amd && typeof require === "function" && require.specified && require.specified("kartkingdom/avatar-animation") ){
			define( 'kartkingdom/avatar-animation',[], function(){
				//construct PBS.KIDS.KartKingdom as a browser global and return it to require.js
				_log("Has AMD Support");
				PBS.KIDS.KartKingdom.avatar = factory();
				return PBS.KIDS.KartKingdom.avatar;
			});
		}
		else {
			//construct browser global
			_log("NO AMD Support found");
			PBS.KIDS.KartKingdom.avatar = factory();
		}
	}( function(){

		return function(parentEl, options){
		
			_log("LOADED");

			var _that = this;
			var _activeAjaxRequests = {};
			var _ajaxID = 1;//Incrementing ID for keeping track of active ajax requests

			// Capture the target window, e.g iframe in springroll container.
			var _target = options ? options.target || window : window;
			_log("target = ", _target);

			var Base64 = {_keyStr:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",encode:function(e){var t="";var n,r,i,s,o,u,a;var f=0;e=Base64._utf8_encode(e);while(f<e.length){n=e.charCodeAt(f++);r=e.charCodeAt(f++);i=e.charCodeAt(f++);s=n>>2;o=(n&3)<<4|r>>4;u=(r&15)<<2|i>>6;a=i&63;if(isNaN(r)){u=a=64;}else if(isNaN(i)){a=64;}t=t+this._keyStr.charAt(s)+this._keyStr.charAt(o)+this._keyStr.charAt(u)+this._keyStr.charAt(a);}return t;},decode:function(e){var t="";var n,r,i;var s,o,u,a;var f=0;e=e.replace(/[^A-Za-z0-9\+\/\=]/g,"");while(f<e.length){s=this._keyStr.indexOf(e.charAt(f++));o=this._keyStr.indexOf(e.charAt(f++));u=this._keyStr.indexOf(e.charAt(f++));a=this._keyStr.indexOf(e.charAt(f++));n=s<<2|o>>4;r=(o&15)<<4|u>>2;i=(u&3)<<6|a;t=t+String.fromCharCode(n);if(u!=64){t=t+String.fromCharCode(r);}if(a!=64){t=t+String.fromCharCode(i);}}t=Base64._utf8_decode(t);return t;},_utf8_encode:function(e){e=e.replace(/\r\n/g,"\n");var t="";for(var n=0;n<e.length;n++){var r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r);}else if(r>127&&r<2048){t+=String.fromCharCode(r>>6|192);t+=String.fromCharCode(r&63|128);}else{t+=String.fromCharCode(r>>12|224);t+=String.fromCharCode(r>>6&63|128);t+=String.fromCharCode(r&63|128);}}return t;},_utf8_decode:function(e){var t="";var n=0;var r=0,c1=0,c2=0;while(n<e.length){r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r);n++;}else if(r>191&&r<224){c2=e.charCodeAt(n+1);t+=String.fromCharCode((r&31)<<6|c2&63);n+=2;}else{c2=e.charCodeAt(n+1);c3=e.charCodeAt(n+2);t+=String.fromCharCode((r&15)<<12|(c2&63)<<6|c3&63);n+=3;}}return t;}};
			
			var supportsLocalStorage = (function(){ try { var l = localStorage; l.setItem("m", "m"); l.removeItem("m"); return true; } catch(e) { return false; }})();

			//Setup local jQuery v@1.8.0 jquery.com | jquery.org/license
			
			var $ = function(a,b){function E(a){var b=D[a]={};return n.each(a.split(q),function(a,c){b[c]=!0}),b}function H(a,c,d){if(d===b&&1===a.nodeType){var e="data-"+c.replace(G,"-$1").toLowerCase();if(d=a.getAttribute(e),"string"==typeof d){try{d="true"===d?!0:"false"===d?!1:"null"===d?null:+d+""===d?+d:F.test(d)?n.parseJSON(d):d}catch(f){}n.data(a,c,d)}else d=b}return d}function I(a){var b;for(b in a)if(("data"!==b||!n.isEmptyObject(a[b]))&&"toJSON"!==b)return!1;return!0}function $(){return!1}function _(){return!0}function fb(a){return!a||!a.parentNode||11===a.parentNode.nodeType}function gb(a,b){do a=a[b];while(a&&1!==a.nodeType);return a}function hb(a,b,c){if(b=b||0,n.isFunction(b))return n.grep(a,function(a,d){var e=!!b.call(a,d,a);return e===c});if(b.nodeType)return n.grep(a,function(a){return a===b===c});if("string"==typeof b){var d=n.grep(a,function(a){return 1===a.nodeType});if(cb.test(b))return n.filter(b,d,!c);b=n.filter(b,d)}return n.grep(a,function(a){return n.inArray(a,b)>=0===c})}function ib(a){var b=jb.split("|"),c=a.createDocumentFragment();if(c.createElement)for(;b.length;)c.createElement(b.pop());return c}function Ab(a,b){return a.getElementsByTagName(b)[0]||a.appendChild(a.ownerDocument.createElement(b))}function Bb(a,b){if(1===b.nodeType&&n.hasData(a)){var c,d,e,f=n._data(a),g=n._data(b,f),h=f.events;if(h){delete g.handle,g.events={};for(c in h)for(d=0,e=h[c].length;e>d;d++)n.event.add(b,c,h[c][d])}g.data&&(g.data=n.extend({},g.data))}}function Cb(a,b){var c;1===b.nodeType&&(b.clearAttributes&&b.clearAttributes(),b.mergeAttributes&&b.mergeAttributes(a),c=b.nodeName.toLowerCase(),"object"===c?(b.parentNode&&(b.outerHTML=a.outerHTML),n.support.html5Clone&&a.innerHTML&&!n.trim(b.innerHTML)&&(b.innerHTML=a.innerHTML)):"input"===c&&tb.test(a.type)?(b.defaultChecked=b.checked=a.checked,b.value!==a.value&&(b.value=a.value)):"option"===c?b.selected=a.defaultSelected:"input"===c||"textarea"===c?b.defaultValue=a.defaultValue:"script"===c&&b.text!==a.text&&(b.text=a.text),b.removeAttribute(n.expando))}function Db(a){return"undefined"!=typeof a.getElementsByTagName?a.getElementsByTagName("*"):"undefined"!=typeof a.querySelectorAll?a.querySelectorAll("*"):[]}function Eb(a){tb.test(a.type)&&(a.defaultChecked=a.checked)}function Vb(a,b){if(b in a)return b;for(var c=b.charAt(0).toUpperCase()+b.slice(1),d=b,e=Tb.length;e--;)if(b=Tb[e]+c,b in a)return b;return d}function Wb(a,b){return a=b||a,"none"===n.css(a,"display")||!n.contains(a.ownerDocument,a)}function Xb(a,b){for(var c,d,e=[],f=0,g=a.length;g>f;f++)c=a[f],c.style&&(e[f]=n._data(c,"olddisplay"),b?(e[f]||"none"!==c.style.display||(c.style.display=""),""===c.style.display&&Wb(c)&&(e[f]=n._data(c,"olddisplay",_b(c.nodeName)))):(d=Fb(c,"display"),e[f]||"none"===d||n._data(c,"olddisplay",d)));for(f=0;g>f;f++)c=a[f],c.style&&(b&&"none"!==c.style.display&&""!==c.style.display||(c.style.display=b?e[f]||"":"none"));return a}function Yb(a,b,c){var d=Mb.exec(b);return d?Math.max(0,d[1]-(c||0))+(d[2]||"px"):b}function Zb(a,b,c,d){for(var e=c===(d?"border":"content")?4:"width"===b?1:0,f=0;4>e;e+=2)"margin"===c&&(f+=n.css(a,c+Sb[e],!0)),d?("content"===c&&(f-=parseFloat(Fb(a,"padding"+Sb[e]))||0),"margin"!==c&&(f-=parseFloat(Fb(a,"border"+Sb[e]+"Width"))||0)):(f+=parseFloat(Fb(a,"padding"+Sb[e]))||0,"padding"!==c&&(f+=parseFloat(Fb(a,"border"+Sb[e]+"Width"))||0));return f}function $b(a,b,c){var d="width"===b?a.offsetWidth:a.offsetHeight,e=!0,f=n.support.boxSizing&&"border-box"===n.css(a,"boxSizing");if(0>=d){if(d=Fb(a,b),(0>d||null==d)&&(d=a.style[b]),Nb.test(d))return d;e=f&&(n.support.boxSizingReliable||d===a.style[b]),d=parseFloat(d)||0}return d+Zb(a,b,c||(f?"border":"content"),e)+"px"}function _b(a){if(Pb[a])return Pb[a];var b=n("<"+a+">").appendTo(e.body),c=b.css("display");return b.remove(),("none"===c||""===c)&&(Gb=e.body.appendChild(Gb||n.extend(e.createElement("iframe"),{frameBorder:0,width:0,height:0})),Hb&&Gb.createElement||(Hb=(Gb.contentWindow||Gb.contentDocument).document,Hb.write("<!doctype html><html><body>"),Hb.close()),b=Hb.body.appendChild(Hb.createElement(a)),c=Fb(b,"display"),e.body.removeChild(Gb)),Pb[a]=c,c}function fc(a,b,c,d){var e;if(n.isArray(b))n.each(b,function(b,e){c||bc.test(a)?d(a,e):fc(a+"["+("object"==typeof e?b:"")+"]",e,c,d)});else if(c||"object"!==n.type(b))d(a,b);else for(e in b)fc(a+"["+e+"]",b[e],c,d)}function wc(a){return function(b,c){"string"!=typeof b&&(c=b,b="*");var d,e,f,g=b.toLowerCase().split(q),h=0,i=g.length;if(n.isFunction(c))for(;i>h;h++)d=g[h],f=/^\+/.test(d),f&&(d=d.substr(1)||"*"),e=a[d]=a[d]||[],e[f?"unshift":"push"](c)}}function xc(a,c,d,e,f,g){f=f||c.dataTypes[0],g=g||{},g[f]=!0;for(var h,i=a[f],j=0,k=i?i.length:0,l=a===sc;k>j&&(l||!h);j++)h=i[j](c,d,e),"string"==typeof h&&(!l||g[h]?h=b:(c.dataTypes.unshift(h),h=xc(a,c,d,e,h,g)));return!l&&h||g["*"]||(h=xc(a,c,d,e,"*",g)),h}function yc(a,c){var d,e,f=n.ajaxSettings.flatOptions||{};for(d in c)c[d]!==b&&((f[d]?a:e||(e={}))[d]=c[d]);e&&n.extend(!0,a,e)}function zc(a,c,d){var e,f,g,h,i=a.contents,j=a.dataTypes,k=a.responseFields;for(f in k)f in d&&(c[k[f]]=d[f]);for(;"*"===j[0];)j.shift(),e===b&&(e=a.mimeType||c.getResponseHeader("content-type"));if(e)for(f in i)if(i[f]&&i[f].test(e)){j.unshift(f);break}if(j[0]in d)g=j[0];else{for(f in d){if(!j[0]||a.converters[f+" "+j[0]]){g=f;break}h||(h=f)}g=g||h}return g?(g!==j[0]&&j.unshift(g),d[g]):void 0}function Ac(a,b){var c,d,e,f,g=a.dataTypes.slice(),h=g[0],i={},j=0;if(a.dataFilter&&(b=a.dataFilter(b,a.dataType)),g[1])for(c in a.converters)i[c.toLowerCase()]=a.converters[c];for(;e=g[++j];)if("*"!==e){if("*"!==h&&h!==e){if(c=i[h+" "+e]||i["* "+e],!c)for(d in i)if(f=d.split(" "),f[1]===e&&(c=i[h+" "+f[0]]||i["* "+f[0]])){c===!0?c=i[d]:i[d]!==!0&&(e=f[0],g.splice(j--,0,e));break}if(c!==!0)if(c&&a["throws"])b=c(b);else try{b=c(b)}catch(k){return{state:"parsererror",error:c?k:"No conversion from "+h+" to "+e}}}h=e}return{state:"success",data:b}}function Ic(){try{return new a.XMLHttpRequest}catch(b){}}function Jc(){try{return new a.ActiveXObject("Microsoft.XMLHTTP")}catch(b){}}function Rc(){return setTimeout(function(){Kc=b},0),Kc=n.now()}function Sc(a,b){n.each(b,function(b,c){for(var d=(Qc[b]||[]).concat(Qc["*"]),e=0,f=d.length;f>e;e++)if(d[e].call(a,b,c))return})}function Tc(a,b,c){var d,e=0,g=Pc.length,h=n.Deferred().always(function(){delete i.elem}),i=function(){for(var b=Kc||Rc(),c=Math.max(0,j.startTime+j.duration-b),d=1-(c/j.duration||0),e=0,f=j.tweens.length;f>e;e++)j.tweens[e].run(d);return h.notifyWith(a,[j,d,c]),1>d&&f?c:(h.resolveWith(a,[j]),!1)},j=h.promise({elem:a,props:n.extend({},b),opts:n.extend(!0,{specialEasing:{}},c),originalProperties:b,originalOptions:c,startTime:Kc||Rc(),duration:c.duration,tweens:[],createTween:function(b,c){var e=n.Tween(a,j.opts,b,c,j.opts.specialEasing[b]||j.opts.easing);return j.tweens.push(e),e},stop:function(b){for(var c=0,d=b?j.tweens.length:0;d>c;c++)j.tweens[c].run(1);return b?h.resolveWith(a,[j,b]):h.rejectWith(a,[j,b]),this}}),k=j.props;for(Uc(k,j.opts.specialEasing);g>e;e++)if(d=Pc[e].call(j,a,k,j.opts))return d;return Sc(j,k),n.isFunction(j.opts.start)&&j.opts.start.call(a,j),n.fx.timer(n.extend(i,{anim:j,queue:j.opts.queue,elem:a})),j.progress(j.opts.progress).done(j.opts.done,j.opts.complete).fail(j.opts.fail).always(j.opts.always)}function Uc(a,b){var c,d,e,f,g;for(c in a)if(d=n.camelCase(c),e=b[d],f=a[c],n.isArray(f)&&(e=f[1],f=a[c]=f[0]),c!==d&&(a[d]=f,delete a[c]),g=n.cssHooks[d],g&&"expand"in g){f=g.expand(f),delete a[d];for(c in f)c in a||(a[c]=f[c],b[c]=e)}else b[d]=e}function Vc(a,b,c){var d,e,f,g,h,i,j,k,l=this,m=a.style,o={},p=[],q=a.nodeType&&Wb(a);c.queue||(j=n._queueHooks(a,"fx"),null==j.unqueued&&(j.unqueued=0,k=j.empty.fire,j.empty.fire=function(){j.unqueued||k()}),j.unqueued++,l.always(function(){l.always(function(){j.unqueued--,n.queue(a,"fx").length||j.empty.fire()})})),1===a.nodeType&&("height"in b||"width"in b)&&(c.overflow=[m.overflow,m.overflowX,m.overflowY],"inline"===n.css(a,"display")&&"none"===n.css(a,"float")&&(n.support.inlineBlockNeedsLayout&&"inline"!==_b(a.nodeName)?m.zoom=1:m.display="inline-block")),c.overflow&&(m.overflow="hidden",n.support.shrinkWrapBlocks||l.done(function(){m.overflow=c.overflow[0],m.overflowX=c.overflow[1],m.overflowY=c.overflow[2]}));for(d in b)if(f=b[d],Mc.exec(f)){if(delete b[d],f===(q?"hide":"show"))continue;p.push(d)}if(g=p.length)for(h=n._data(a,"fxshow")||n._data(a,"fxshow",{}),q?n(a).show():l.done(function(){n(a).hide()}),l.done(function(){var b;n.removeData(a,"fxshow",!0);for(b in o)n.style(a,b,o[b])}),d=0;g>d;d++)e=p[d],i=l.createTween(e,q?h[e]:0),o[e]=h[e]||n.style(a,e),e in h||(h[e]=i.start,q&&(i.end=i.start,i.start="width"===e||"height"===e?1:0))}function Wc(a,b,c,d,e){return new Wc.prototype.init(a,b,c,d,e)}function Xc(a,b){for(var c,d={height:a},e=0;4>e;e+=2-b)c=Sb[e],d["margin"+c]=d["padding"+c]=a;return b&&(d.opacity=d.width=a),d}function Zc(a){return n.isWindow(a)?a:9===a.nodeType?a.defaultView||a.parentWindow:!1}var c,d,e=a.document,f=a.location,g=a.navigator,h=Array.prototype.push,i=Array.prototype.slice,j=Array.prototype.indexOf,k=Object.prototype.toString,l=Object.prototype.hasOwnProperty,m=String.prototype.trim,n=function(a,b){return new n.fn.init(a,b,c)},o=/[\-+]?(?:\d*\.|)\d+(?:[eE][\-+]?\d+|)/.source,p=/\S/,q=/\s+/,r=p.test("\xa0")?/^[\s\xA0]+|[\s\xA0]+$/g:/^\s+|\s+$/g,s=/^(?:[^#<]*(<[\w\W]+>)[^>]*$|#([\w\-]*)$)/,t=/^<(\w+)\s*\/?>(?:<\/\1>|)$/,u=/^[\],:{}\s]*$/,v=/(?:^|:|,)(?:\s*\[)+/g,w=/\\(?:["\\\/bfnrt]|u[\da-fA-F]{4})/g,x=/"[^"\\\r\n]*"|true|false|null|-?(?:\d\d*\.|)\d+(?:[eE][\-+]?\d+|)/g,y=/^-ms-/,z=/-([\da-z])/gi,A=function(a,b){return(b+"").toUpperCase()},B=function(){e.addEventListener?(e.removeEventListener("DOMContentLoaded",B,!1),n.ready()):"complete"===e.readyState&&(e.detachEvent("onreadystatechange",B),n.ready())},C={};n.fn=n.prototype={constructor:n,init:function(a,c,d){var f,g,i;if(!a)return this;if(a.nodeType)return this.context=this[0]=a,this.length=1,this;if("string"==typeof a){if(f="<"===a.charAt(0)&&">"===a.charAt(a.length-1)&&a.length>=3?[null,a,null]:s.exec(a),!f||!f[1]&&c)return!c||c.jquery?(c||d).find(a):this.constructor(c).find(a);if(f[1])return c=c instanceof n?c[0]:c,i=c&&c.nodeType?c.ownerDocument||c:e,a=n.parseHTML(f[1],i,!0),t.test(f[1])&&n.isPlainObject(c)&&this.attr.call(a,c,!0),n.merge(this,a);if(g=e.getElementById(f[2]),g&&g.parentNode){if(g.id!==f[2])return d.find(a);this.length=1,this[0]=g}return this.context=e,this.selector=a,this}return n.isFunction(a)?d.ready(a):(a.selector!==b&&(this.selector=a.selector,this.context=a.context),n.makeArray(a,this))},selector:"",jquery:"1.8.0",length:0,size:function(){return this.length},toArray:function(){return i.call(this)},get:function(a){return null==a?this.toArray():0>a?this[this.length+a]:this[a]},pushStack:function(a,b,c){var d=n.merge(this.constructor(),a);return d.prevObject=this,d.context=this.context,"find"===b?d.selector=this.selector+(this.selector?" ":"")+c:b&&(d.selector=this.selector+"."+b+"("+c+")"),d},each:function(a,b){return n.each(this,a,b)},ready:function(a){return n.ready.promise().done(a),this},eq:function(a){return a=+a,-1===a?this.slice(a):this.slice(a,a+1)},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},slice:function(){return this.pushStack(i.apply(this,arguments),"slice",i.call(arguments).join(","))},map:function(a){return this.pushStack(n.map(this,function(b,c){return a.call(b,c,b)}))},end:function(){return this.prevObject||this.constructor(null)},push:h,sort:[].sort,splice:[].splice},n.fn.init.prototype=n.fn,n.extend=n.fn.extend=function(){var a,c,d,e,f,g,h=arguments[0]||{},i=1,j=arguments.length,k=!1;for("boolean"==typeof h&&(k=h,h=arguments[1]||{},i=2),"object"==typeof h||n.isFunction(h)||(h={}),j===i&&(h=this,--i);j>i;i++)if(null!=(a=arguments[i]))for(c in a)d=h[c],e=a[c],h!==e&&(k&&e&&(n.isPlainObject(e)||(f=n.isArray(e)))?(f?(f=!1,g=d&&n.isArray(d)?d:[]):g=d&&n.isPlainObject(d)?d:{},h[c]=n.extend(k,g,e)):e!==b&&(h[c]=e));return h},n.extend({noConflict:function(){return n},isReady:!1,readyWait:1,holdReady:function(a){a?n.readyWait++:n.ready(!0)},ready:function(a){if(a===!0?!--n.readyWait:!n.isReady){if(!e.body)return setTimeout(n.ready,1);n.isReady=!0,a!==!0&&--n.readyWait>0||(d.resolveWith(e,[n]),n.fn.trigger&&n(e).trigger("ready").off("ready"))}},isFunction:function(a){return"function"===n.type(a)},isArray:Array.isArray||function(a){return"array"===n.type(a)},isWindow:function(a){return null!=a&&a==a.window},isNumeric:function(a){return!isNaN(parseFloat(a))&&isFinite(a)},type:function(a){return null==a?String(a):C[k.call(a)]||"object"},isPlainObject:function(a){if(!a||"object"!==n.type(a)||a.nodeType||n.isWindow(a))return!1;try{if(a.constructor&&!l.call(a,"constructor")&&!l.call(a.constructor.prototype,"isPrototypeOf"))return!1}catch(c){return!1}var d;for(d in a);return d===b||l.call(a,d)},isEmptyObject:function(a){var b;for(b in a)return!1;return!0},error:function(a){throw new Error(a)},parseHTML:function(a,b,c){var d;return a&&"string"==typeof a?("boolean"==typeof b&&(c=b,b=0),b=b||e,(d=t.exec(a))?[b.createElement(d[1])]:(d=n.buildFragment([a],b,c?null:[]),n.merge([],(d.cacheable?n.clone(d.fragment):d.fragment).childNodes))):null},parseJSON:function(b){return b&&"string"==typeof b?(b=n.trim(b),a.JSON&&a.JSON.parse?a.JSON.parse(b):u.test(b.replace(w,"@").replace(x,"]").replace(v,""))?new Function("return "+b)():(n.error("Invalid JSON: "+b),void 0)):null},parseXML:function(c){var d,e;if(!c||"string"!=typeof c)return null;try{a.DOMParser?(e=new DOMParser,d=e.parseFromString(c,"text/xml")):(d=new ActiveXObject("Microsoft.XMLDOM"),d.async="false",d.loadXML(c))}catch(f){d=b}return d&&d.documentElement&&!d.getElementsByTagName("parsererror").length||n.error("Invalid XML: "+c),d},noop:function(){},globalEval:function(b){b&&p.test(b)&&(a.execScript||function(b){a.eval.call(a,b)})(b)},camelCase:function(a){return a.replace(y,"ms-").replace(z,A)},nodeName:function(a,b){return a.nodeName&&a.nodeName.toUpperCase()===b.toUpperCase()},each:function(a,c,d){var e,f=0,g=a.length,h=g===b||n.isFunction(a);if(d)if(h){for(e in a)if(c.apply(a[e],d)===!1)break}else for(;g>f&&c.apply(a[f++],d)!==!1;);else if(h){for(e in a)if(c.call(a[e],e,a[e])===!1)break}else for(;g>f&&c.call(a[f],f,a[f++])!==!1;);return a},trim:m?function(a){return null==a?"":m.call(a)}:function(a){return null==a?"":a.toString().replace(r,"")},makeArray:function(a,b){var c,d=b||[];return null!=a&&(c=n.type(a),null==a.length||"string"===c||"function"===c||"regexp"===c||n.isWindow(a)?h.call(d,a):n.merge(d,a)),d},inArray:function(a,b,c){var d;if(b){if(j)return j.call(b,a,c);for(d=b.length,c=c?0>c?Math.max(0,d+c):c:0;d>c;c++)if(c in b&&b[c]===a)return c}return-1},merge:function(a,c){var d=c.length,e=a.length,f=0;if("number"==typeof d)for(;d>f;f++)a[e++]=c[f];else for(;c[f]!==b;)a[e++]=c[f++];return a.length=e,a},grep:function(a,b,c){var d,e=[],f=0,g=a.length;for(c=!!c;g>f;f++)d=!!b(a[f],f),c!==d&&e.push(a[f]);return e},map:function(a,c,d){var e,f,g=[],h=0,i=a.length,j=a instanceof n||i!==b&&"number"==typeof i&&(i>0&&a[0]&&a[i-1]||0===i||n.isArray(a));if(j)for(;i>h;h++)e=c(a[h],h,d),null!=e&&(g[g.length]=e);else for(f in a)e=c(a[f],f,d),null!=e&&(g[g.length]=e);return g.concat.apply([],g)},guid:1,proxy:function(a,c){var d,e,f;return"string"==typeof c&&(d=a[c],c=a,a=d),n.isFunction(a)?(e=i.call(arguments,2),f=function(){return a.apply(c,e.concat(i.call(arguments)))},f.guid=a.guid=a.guid||f.guid||n.guid++,f):b},access:function(a,c,d,e,f,g,h){var i,j=null==d,k=0,l=a.length;if(d&&"object"==typeof d){for(k in d)n.access(a,c,k,d[k],1,g,e);f=1}else if(e!==b){if(i=h===b&&n.isFunction(e),j&&(i?(i=c,c=function(a,b,c){return i.call(n(a),c)}):(c.call(a,e),c=null)),c)for(;l>k;k++)c(a[k],d,i?e.call(a[k],k,c(a[k],d)):e,h);f=1}return f?a:j?c.call(a):l?c(a[0],d):g},now:function(){return(new Date).getTime()}}),n.ready.promise=function(b){if(!d)if(d=n.Deferred(),"complete"===e.readyState||"loading"!==e.readyState&&e.addEventListener)setTimeout(n.ready,1);else if(e.addEventListener)e.addEventListener("DOMContentLoaded",B,!1),a.addEventListener("load",n.ready,!1);else{e.attachEvent("onreadystatechange",B),a.attachEvent("onload",n.ready);var c=!1;try{c=null==a.frameElement&&e.documentElement}catch(f){}c&&c.doScroll&&function g(){if(!n.isReady){try{c.doScroll("left")}catch(a){return setTimeout(g,50)}n.ready()}}()}return d.promise(b)},n.each("Boolean Number String Function Array Date RegExp Object".split(" "),function(a,b){C["[object "+b+"]"]=b.toLowerCase()}),c=n(e);var D={};n.Callbacks=function(a){a="string"==typeof a?D[a]||E(a):n.extend({},a);var c,d,e,f,g,h,i=[],j=!a.once&&[],k=function(b){for(c=a.memory&&b,d=!0,h=f||0,f=0,g=i.length,e=!0;i&&g>h;h++)if(i[h].apply(b[0],b[1])===!1&&a.stopOnFalse){c=!1;break}e=!1,i&&(j?j.length&&k(j.shift()):c?i=[]:l.disable())},l={add:function(){if(i){var b=i.length;!function d(b){n.each(b,function(b,c){!n.isFunction(c)||a.unique&&l.has(c)?c&&c.length&&d(c):i.push(c)})}(arguments),e?g=i.length:c&&(f=b,k(c))}return this},remove:function(){return i&&n.each(arguments,function(a,b){for(var c;(c=n.inArray(b,i,c))>-1;)i.splice(c,1),e&&(g>=c&&g--,h>=c&&h--)}),this},has:function(a){return n.inArray(a,i)>-1},empty:function(){return i=[],this},disable:function(){return i=j=c=b,this},disabled:function(){return!i},lock:function(){return j=b,c||l.disable(),this},locked:function(){return!j},fireWith:function(a,b){return b=b||[],b=[a,b.slice?b.slice():b],!i||d&&!j||(e?j.push(b):k(b)),this},fire:function(){return l.fireWith(this,arguments),this},fired:function(){return!!d}};return l},n.extend({Deferred:function(a){var b=[["resolve","done",n.Callbacks("once memory"),"resolved"],["reject","fail",n.Callbacks("once memory"),"rejected"],["notify","progress",n.Callbacks("memory")]],c="pending",d={state:function(){return c},always:function(){return e.done(arguments).fail(arguments),this},then:function(){var a=arguments;return n.Deferred(function(c){n.each(b,function(b,d){var f=d[0],g=a[b];e[d[1]](n.isFunction(g)?function(){var a=g.apply(this,arguments);a&&n.isFunction(a.promise)?a.promise().done(c.resolve).fail(c.reject).progress(c.notify):c[f+"With"](this===e?c:this,[a])}:c[f])}),a=null}).promise()},promise:function(a){return"object"==typeof a?n.extend(a,d):d}},e={};return d.pipe=d.then,n.each(b,function(a,f){var g=f[2],h=f[3];d[f[1]]=g.add,h&&g.add(function(){c=h},b[1^a][2].disable,b[2][2].lock),e[f[0]]=g.fire,e[f[0]+"With"]=g.fireWith}),d.promise(e),a&&a.call(e,e),e},when:function(a){var h,j,k,b=0,c=i.call(arguments),d=c.length,e=1!==d||a&&n.isFunction(a.promise)?d:0,f=1===e?a:n.Deferred(),g=function(a,b,c){return function(d){b[a]=this,c[a]=arguments.length>1?i.call(arguments):d,c===h?f.notifyWith(b,c):--e||f.resolveWith(b,c)}};if(d>1)for(h=new Array(d),j=new Array(d),k=new Array(d);d>b;b++)c[b]&&n.isFunction(c[b].promise)?c[b].promise().done(g(b,k,c)).fail(f.reject).progress(g(b,j,h)):--e;return e||f.resolveWith(k,c),f.promise()}}),n.support=function(){var b,c,d,f,g,h,i,j,k,l,m,o=e.createElement("div");if(o.setAttribute("className","t"),o.innerHTML="  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>",c=o.getElementsByTagName("*"),d=o.getElementsByTagName("a")[0],d.style.cssText="top:1px;float:left;opacity:.5",!c||!c.length||!d)return{};f=e.createElement("select"),g=f.appendChild(e.createElement("option")),h=o.getElementsByTagName("input")[0],b={leadingWhitespace:3===o.firstChild.nodeType,tbody:!o.getElementsByTagName("tbody").length,htmlSerialize:!!o.getElementsByTagName("link").length,style:/top/.test(d.getAttribute("style")),hrefNormalized:"/a"===d.getAttribute("href"),opacity:/^0.5/.test(d.style.opacity),cssFloat:!!d.style.cssFloat,checkOn:"on"===h.value,optSelected:g.selected,getSetAttribute:"t"!==o.className,enctype:!!e.createElement("form").enctype,html5Clone:"<:nav></:nav>"!==e.createElement("nav").cloneNode(!0).outerHTML,boxModel:"CSS1Compat"===e.compatMode,submitBubbles:!0,changeBubbles:!0,focusinBubbles:!1,deleteExpando:!0,noCloneEvent:!0,inlineBlockNeedsLayout:!1,shrinkWrapBlocks:!1,reliableMarginRight:!0,boxSizingReliable:!0,pixelPosition:!1},h.checked=!0,b.noCloneChecked=h.cloneNode(!0).checked,f.disabled=!0,b.optDisabled=!g.disabled;try{delete o.test}catch(p){b.deleteExpando=!1}if(!o.addEventListener&&o.attachEvent&&o.fireEvent&&(o.attachEvent("onclick",m=function(){b.noCloneEvent=!1}),o.cloneNode(!0).fireEvent("onclick"),o.detachEvent("onclick",m)),h=e.createElement("input"),h.value="t",h.setAttribute("type","radio"),b.radioValue="t"===h.value,h.setAttribute("checked","checked"),h.setAttribute("name","t"),o.appendChild(h),i=e.createDocumentFragment(),i.appendChild(o.lastChild),b.checkClone=i.cloneNode(!0).cloneNode(!0).lastChild.checked,b.appendChecked=h.checked,i.removeChild(h),i.appendChild(o),o.attachEvent)for(k in{submit:!0,change:!0,focusin:!0})j="on"+k,l=j in o,l||(o.setAttribute(j,"return;"),l="function"==typeof o[j]),b[k+"Bubbles"]=l;return n(function(){var c,d,f,g,h="padding:0;margin:0;border:0;display:block;overflow:hidden;",i=e.getElementsByTagName("body")[0];i&&(c=e.createElement("div"),c.style.cssText="visibility:hidden;border:0;width:0;height:0;position:static;top:0;margin-top:1px",i.insertBefore(c,i.firstChild),d=e.createElement("div"),c.appendChild(d),d.innerHTML="<table><tr><td></td><td>t</td></tr></table>",f=d.getElementsByTagName("td"),f[0].style.cssText="padding:0;margin:0;border:0;display:none",l=0===f[0].offsetHeight,f[0].style.display="",f[1].style.display="none",b.reliableHiddenOffsets=l&&0===f[0].offsetHeight,d.innerHTML="",d.style.cssText="box-sizing:border-box;-moz-box-sizing:border-box;-webkit-box-sizing:border-box;padding:1px;border:1px;display:block;width:4px;margin-top:1%;position:absolute;top:1%;",b.boxSizing=4===d.offsetWidth,b.doesNotIncludeMarginInBodyOffset=1!==i.offsetTop,a.getComputedStyle&&(b.pixelPosition="1%"!==(a.getComputedStyle(d,null)||{}).top,b.boxSizingReliable="4px"===(a.getComputedStyle(d,null)||{width:"4px"}).width,g=e.createElement("div"),g.style.cssText=d.style.cssText=h,g.style.marginRight=g.style.width="0",d.style.width="1px",d.appendChild(g),b.reliableMarginRight=!parseFloat((a.getComputedStyle(g,null)||{}).marginRight)),"undefined"!=typeof d.style.zoom&&(d.innerHTML="",d.style.cssText=h+"width:1px;padding:1px;display:inline;zoom:1",b.inlineBlockNeedsLayout=3===d.offsetWidth,d.style.display="block",d.style.overflow="visible",d.innerHTML="<div></div>",d.firstChild.style.width="5px",b.shrinkWrapBlocks=3!==d.offsetWidth,c.style.zoom=1),i.removeChild(c),c=d=f=g=null)}),i.removeChild(o),c=d=f=g=h=i=o=null,b}();var F=/^(?:\{.*\}|\[.*\])$/,G=/([A-Z])/g;n.extend({cache:{},deletedIds:[],uuid:0,expando:"jQuery"+(n.fn.jquery+Math.random()).replace(/\D/g,""),noData:{embed:!0,object:"clsid:D27CDB6E-AE6D-11cf-96B8-444553540000",applet:!0},hasData:function(a){return a=a.nodeType?n.cache[a[n.expando]]:a[n.expando],!!a&&!I(a)},data:function(a,c,d,e){if(n.acceptData(a)){var f,g,h=n.expando,i="string"==typeof c,j=a.nodeType,k=j?n.cache:a,l=j?a[h]:a[h]&&h;if(l&&k[l]&&(e||k[l].data)||!i||d!==b)return l||(j?a[h]=l=n.deletedIds.pop()||++n.uuid:l=h),k[l]||(k[l]={},j||(k[l].toJSON=n.noop)),("object"==typeof c||"function"==typeof c)&&(e?k[l]=n.extend(k[l],c):k[l].data=n.extend(k[l].data,c)),f=k[l],e||(f.data||(f.data={}),f=f.data),d!==b&&(f[n.camelCase(c)]=d),i?(g=f[c],null==g&&(g=f[n.camelCase(c)])):g=f,g}},removeData:function(a,b,c){if(n.acceptData(a)){var d,e,f,g=a.nodeType,h=g?n.cache:a,i=g?a[n.expando]:n.expando;if(h[i]){if(b&&(d=c?h[i]:h[i].data)){n.isArray(b)||(b in d?b=[b]:(b=n.camelCase(b),b=b in d?[b]:b.split(" ")));for(e=0,f=b.length;f>e;e++)delete d[b[e]];if(!(c?I:n.isEmptyObject)(d))return}(c||(delete h[i].data,I(h[i])))&&(g?n.cleanData([a],!0):n.support.deleteExpando||h!=h.window?delete h[i]:h[i]=null)}}},_data:function(a,b,c){return n.data(a,b,c,!0)},acceptData:function(a){var b=a.nodeName&&n.noData[a.nodeName.toLowerCase()];return!b||b!==!0&&a.getAttribute("classid")===b}}),n.fn.extend({data:function(a,c){var d,e,f,g,h,i=this[0],j=0,k=null;if(a===b){if(this.length&&(k=n.data(i),1===i.nodeType&&!n._data(i,"parsedAttrs"))){for(f=i.attributes,h=f.length;h>j;j++)g=f[j].name,0===g.indexOf("data-")&&(g=n.camelCase(g.substring(5)),H(i,g,k[g]));n._data(i,"parsedAttrs",!0)}return k}return"object"==typeof a?this.each(function(){n.data(this,a)}):(d=a.split(".",2),d[1]=d[1]?"."+d[1]:"",e=d[1]+"!",n.access(this,function(c){return c===b?(k=this.triggerHandler("getData"+e,[d[0]]),k===b&&i&&(k=n.data(i,a),k=H(i,a,k)),k===b&&d[1]?this.data(d[0]):k):(d[1]=c,this.each(function(){var b=n(this);b.triggerHandler("setData"+e,d),n.data(this,a,c),b.triggerHandler("changeData"+e,d)}),void 0)},null,c,arguments.length>1,null,!1))},removeData:function(a){return this.each(function(){n.removeData(this,a)})}}),n.extend({queue:function(a,b,c){var d;return a?(b=(b||"fx")+"queue",d=n._data(a,b),c&&(!d||n.isArray(c)?d=n._data(a,b,n.makeArray(c)):d.push(c)),d||[]):void 0},dequeue:function(a,b){b=b||"fx";var c=n.queue(a,b),d=c.shift(),e=n._queueHooks(a,b),f=function(){n.dequeue(a,b)};"inprogress"===d&&(d=c.shift()),d&&("fx"===b&&c.unshift("inprogress"),delete e.stop,d.call(a,f,e)),!c.length&&e&&e.empty.fire()},_queueHooks:function(a,b){var c=b+"queueHooks";return n._data(a,c)||n._data(a,c,{empty:n.Callbacks("once memory").add(function(){n.removeData(a,b+"queue",!0),n.removeData(a,c,!0)})})}}),n.fn.extend({queue:function(a,c){var d=2;return"string"!=typeof a&&(c=a,a="fx",d--),arguments.length<d?n.queue(this[0],a):c===b?this:this.each(function(){var b=n.queue(this,a,c);n._queueHooks(this,a),"fx"===a&&"inprogress"!==b[0]&&n.dequeue(this,a)})},dequeue:function(a){return this.each(function(){n.dequeue(this,a)})},delay:function(a,b){return a=n.fx?n.fx.speeds[a]||a:a,b=b||"fx",this.queue(b,function(b,c){var d=setTimeout(b,a);c.stop=function(){clearTimeout(d)}})},clearQueue:function(a){return this.queue(a||"fx",[])},promise:function(a,c){var d,e=1,f=n.Deferred(),g=this,h=this.length,i=function(){--e||f.resolveWith(g,[g])};for("string"!=typeof a&&(c=a,a=b),a=a||"fx";h--;)(d=n._data(g[h],a+"queueHooks"))&&d.empty&&(e++,d.empty.add(i));return i(),f.promise(c)}});var J,K,L,M=/[\t\r\n]/g,N=/\r/g,O=/^(?:button|input)$/i,P=/^(?:button|input|object|select|textarea)$/i,Q=/^a(?:rea|)$/i,R=/^(?:autofocus|autoplay|async|checked|controls|defer|disabled|hidden|loop|multiple|open|readonly|required|scoped|selected)$/i,S=n.support.getSetAttribute;n.fn.extend({attr:function(a,b){return n.access(this,n.attr,a,b,arguments.length>1)},removeAttr:function(a){return this.each(function(){n.removeAttr(this,a)})},prop:function(a,b){return n.access(this,n.prop,a,b,arguments.length>1)},removeProp:function(a){return a=n.propFix[a]||a,this.each(function(){try{this[a]=b,delete this[a]}catch(c){}})},addClass:function(a){var b,c,d,e,f,g,h;if(n.isFunction(a))return this.each(function(b){n(this).addClass(a.call(this,b,this.className))});if(a&&"string"==typeof a)for(b=a.split(q),c=0,d=this.length;d>c;c++)if(e=this[c],1===e.nodeType)if(e.className||1!==b.length){for(f=" "+e.className+" ",g=0,h=b.length;h>g;g++)~f.indexOf(" "+b[g]+" ")||(f+=b[g]+" ");e.className=n.trim(f)}else e.className=a;return this},removeClass:function(a){var c,d,e,f,g,h,i;if(n.isFunction(a))return this.each(function(b){n(this).removeClass(a.call(this,b,this.className))});if(a&&"string"==typeof a||a===b)for(c=(a||"").split(q),h=0,i=this.length;i>h;h++)if(e=this[h],1===e.nodeType&&e.className){for(d=(" "+e.className+" ").replace(M," "),f=0,g=c.length;g>f;f++)for(;d.indexOf(" "+c[f]+" ")>-1;)d=d.replace(" "+c[f]+" "," ");e.className=a?n.trim(d):""}return this},toggleClass:function(a,b){var c=typeof a,d="boolean"==typeof b;return n.isFunction(a)?this.each(function(c){n(this).toggleClass(a.call(this,c,this.className,b),b)}):this.each(function(){if("string"===c)for(var e,f=0,g=n(this),h=b,i=a.split(q);e=i[f++];)h=d?h:!g.hasClass(e),g[h?"addClass":"removeClass"](e);else("undefined"===c||"boolean"===c)&&(this.className&&n._data(this,"__className__",this.className),this.className=this.className||a===!1?"":n._data(this,"__className__")||"")})},hasClass:function(a){for(var b=" "+a+" ",c=0,d=this.length;d>c;c++)if(1===this[c].nodeType&&(" "+this[c].className+" ").replace(M," ").indexOf(b)>-1)return!0;return!1},val:function(a){var c,d,e,f=this[0];{if(arguments.length)return e=n.isFunction(a),this.each(function(d){var f,g=n(this);1===this.nodeType&&(f=e?a.call(this,d,g.val()):a,null==f?f="":"number"==typeof f?f+="":n.isArray(f)&&(f=n.map(f,function(a){return null==a?"":a+""})),c=n.valHooks[this.type]||n.valHooks[this.nodeName.toLowerCase()],c&&"set"in c&&c.set(this,f,"value")!==b||(this.value=f))});if(f)return c=n.valHooks[f.type]||n.valHooks[f.nodeName.toLowerCase()],c&&"get"in c&&(d=c.get(f,"value"))!==b?d:(d=f.value,"string"==typeof d?d.replace(N,""):null==d?"":d)}}}),n.extend({valHooks:{option:{get:function(a){var b=a.attributes.value;return!b||b.specified?a.value:a.text}},select:{get:function(a){var b,c,d,e,f=a.selectedIndex,g=[],h=a.options,i="select-one"===a.type;if(0>f)return null;for(c=i?f:0,d=i?f+1:h.length;d>c;c++)if(e=h[c],!(!e.selected||(n.support.optDisabled?e.disabled:null!==e.getAttribute("disabled"))||e.parentNode.disabled&&n.nodeName(e.parentNode,"optgroup"))){if(b=n(e).val(),i)return b;g.push(b)}return i&&!g.length&&h.length?n(h[f]).val():g},set:function(a,b){var c=n.makeArray(b);return n(a).find("option").each(function(){this.selected=n.inArray(n(this).val(),c)>=0}),c.length||(a.selectedIndex=-1),c}}},attrFn:{},attr:function(a,c,d,e){var f,g,h,i=a.nodeType;if(a&&3!==i&&8!==i&&2!==i)return e&&n.isFunction(n.fn[c])?n(a)[c](d):"undefined"==typeof a.getAttribute?n.prop(a,c,d):(h=1!==i||!n.isXMLDoc(a),h&&(c=c.toLowerCase(),g=n.attrHooks[c]||(R.test(c)?K:J)),d!==b?null===d?(n.removeAttr(a,c),void 0):g&&"set"in g&&h&&(f=g.set(a,d,c))!==b?f:(a.setAttribute(c,""+d),d):g&&"get"in g&&h&&null!==(f=g.get(a,c))?f:(f=a.getAttribute(c),null===f?b:f))},removeAttr:function(a,b){var c,d,e,f,g=0;if(b&&1===a.nodeType)for(d=b.split(q);g<d.length;g++)e=d[g],e&&(c=n.propFix[e]||e,f=R.test(e),f||n.attr(a,e,""),a.removeAttribute(S?e:c),f&&c in a&&(a[c]=!1))},attrHooks:{type:{set:function(a,b){if(O.test(a.nodeName)&&a.parentNode)n.error("type property can't be changed");else if(!n.support.radioValue&&"radio"===b&&n.nodeName(a,"input")){var c=a.value;return a.setAttribute("type",b),c&&(a.value=c),b}}},value:{get:function(a,b){return J&&n.nodeName(a,"button")?J.get(a,b):b in a?a.value:null},set:function(a,b,c){return J&&n.nodeName(a,"button")?J.set(a,b,c):(a.value=b,void 0)}}},propFix:{tabindex:"tabIndex",readonly:"readOnly","for":"htmlFor","class":"className",maxlength:"maxLength",cellspacing:"cellSpacing",cellpadding:"cellPadding",rowspan:"rowSpan",colspan:"colSpan",usemap:"useMap",frameborder:"frameBorder",contenteditable:"contentEditable"},prop:function(a,c,d){var e,f,g,h=a.nodeType;if(a&&3!==h&&8!==h&&2!==h)return g=1!==h||!n.isXMLDoc(a),g&&(c=n.propFix[c]||c,f=n.propHooks[c]),d!==b?f&&"set"in f&&(e=f.set(a,d,c))!==b?e:a[c]=d:f&&"get"in f&&null!==(e=f.get(a,c))?e:a[c]},propHooks:{tabIndex:{get:function(a){var c=a.getAttributeNode("tabindex");return c&&c.specified?parseInt(c.value,10):P.test(a.nodeName)||Q.test(a.nodeName)&&a.href?0:b}}}}),K={get:function(a,c){var d,e=n.prop(a,c);return e===!0||"boolean"!=typeof e&&(d=a.getAttributeNode(c))&&d.nodeValue!==!1?c.toLowerCase():b},set:function(a,b,c){var d;return b===!1?n.removeAttr(a,c):(d=n.propFix[c]||c,d in a&&(a[d]=!0),a.setAttribute(c,c.toLowerCase())),c}},S||(L={name:!0,id:!0,coords:!0},J=n.valHooks.button={get:function(a,c){var d;return d=a.getAttributeNode(c),d&&(L[c]?""!==d.value:d.specified)?d.value:b},set:function(a,b,c){var d=a.getAttributeNode(c);return d||(d=e.createAttribute(c),a.setAttributeNode(d)),d.value=b+""}},n.each(["width","height"],function(a,b){n.attrHooks[b]=n.extend(n.attrHooks[b],{set:function(a,c){return""===c?(a.setAttribute(b,"auto"),c):void 0}})}),n.attrHooks.contenteditable={get:J.get,set:function(a,b,c){""===b&&(b="false"),J.set(a,b,c) }}),n.support.hrefNormalized||n.each(["href","src","width","height"],function(a,c){n.attrHooks[c]=n.extend(n.attrHooks[c],{get:function(a){var d=a.getAttribute(c,2);return null===d?b:d}})}),n.support.style||(n.attrHooks.style={get:function(a){return a.style.cssText.toLowerCase()||b},set:function(a,b){return a.style.cssText=""+b}}),n.support.optSelected||(n.propHooks.selected=n.extend(n.propHooks.selected,{get:function(a){var b=a.parentNode;return b&&(b.selectedIndex,b.parentNode&&b.parentNode.selectedIndex),null}})),n.support.enctype||(n.propFix.enctype="encoding"),n.support.checkOn||n.each(["radio","checkbox"],function(){n.valHooks[this]={get:function(a){return null===a.getAttribute("value")?"on":a.value}}}),n.each(["radio","checkbox"],function(){n.valHooks[this]=n.extend(n.valHooks[this],{set:function(a,b){return n.isArray(b)?a.checked=n.inArray(n(a).val(),b)>=0:void 0}})});var T=/^(?:textarea|input|select)$/i,U=/^([^\.]*|)(?:\.(.+)|)$/,V=/(?:^|\s)hover(\.\S+|)\b/,W=/^key/,X=/^(?:mouse|contextmenu)|click/,Y=/^(?:focusinfocus|focusoutblur)$/,Z=function(a){return n.event.special.hover?a:a.replace(V,"mouseenter$1 mouseleave$1")};n.event={add:function(a,c,d,e,f){var g,h,i,j,k,l,m,o,p,q,r;if(3!==a.nodeType&&8!==a.nodeType&&c&&d&&(g=n._data(a))){for(d.handler&&(p=d,d=p.handler,f=p.selector),d.guid||(d.guid=n.guid++),i=g.events,i||(g.events=i={}),h=g.handle,h||(g.handle=h=function(a){return"undefined"==typeof n||a&&n.event.triggered===a.type?b:n.event.dispatch.apply(h.elem,arguments)},h.elem=a),c=n.trim(Z(c)).split(" "),j=0;j<c.length;j++)k=U.exec(c[j])||[],l=k[1],m=(k[2]||"").split(".").sort(),r=n.event.special[l]||{},l=(f?r.delegateType:r.bindType)||l,r=n.event.special[l]||{},o=n.extend({type:l,origType:k[1],data:e,handler:d,guid:d.guid,selector:f,namespace:m.join(".")},p),q=i[l],q||(q=i[l]=[],q.delegateCount=0,r.setup&&r.setup.call(a,e,m,h)!==!1||(a.addEventListener?a.addEventListener(l,h,!1):a.attachEvent&&a.attachEvent("on"+l,h))),r.add&&(r.add.call(a,o),o.handler.guid||(o.handler.guid=d.guid)),f?q.splice(q.delegateCount++,0,o):q.push(o),n.event.global[l]=!0;a=null}},global:{},remove:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,o,p,q,r=n.hasData(a)&&n._data(a);if(r&&(m=r.events)){for(b=n.trim(Z(b||"")).split(" "),f=0;f<b.length;f++)if(g=U.exec(b[f])||[],h=i=g[1],j=g[2],h){for(o=n.event.special[h]||{},h=(d?o.delegateType:o.bindType)||h,p=m[h]||[],k=p.length,j=j?new RegExp("(^|\\.)"+j.split(".").sort().join("\\.(?:.*\\.|)")+"(\\.|$)"):null,l=0;l<p.length;l++)q=p[l],!e&&i!==q.origType||c&&c.guid!==q.guid||j&&!j.test(q.namespace)||d&&d!==q.selector&&("**"!==d||!q.selector)||(p.splice(l--,1),q.selector&&p.delegateCount--,o.remove&&o.remove.call(a,q));0===p.length&&k!==p.length&&(o.teardown&&o.teardown.call(a,j,r.handle)!==!1||n.removeEvent(a,h,r.handle),delete m[h])}else for(h in m)n.event.remove(a,h+b[f],c,d,!0);n.isEmptyObject(m)&&(delete r.handle,n.removeData(a,"events",!0))}},customEvent:{getData:!0,setData:!0,changeData:!0},trigger:function(c,d,f,g){if(!f||3!==f.nodeType&&8!==f.nodeType){var h,i,j,k,l,m,o,p,q,r,s=c.type||c,t=[];if(!Y.test(s+n.event.triggered)&&(s.indexOf("!")>=0&&(s=s.slice(0,-1),i=!0),s.indexOf(".")>=0&&(t=s.split("."),s=t.shift(),t.sort()),f&&!n.event.customEvent[s]||n.event.global[s]))if(c="object"==typeof c?c[n.expando]?c:new n.Event(s,c):new n.Event(s),c.type=s,c.isTrigger=!0,c.exclusive=i,c.namespace=t.join("."),c.namespace_re=c.namespace?new RegExp("(^|\\.)"+t.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,m=s.indexOf(":")<0?"on"+s:"",f){if(c.result=b,c.target||(c.target=f),d=null!=d?n.makeArray(d):[],d.unshift(c),o=n.event.special[s]||{},!o.trigger||o.trigger.apply(f,d)!==!1){if(q=[[f,o.bindType||s]],!g&&!o.noBubble&&!n.isWindow(f)){for(r=o.delegateType||s,k=Y.test(r+s)?f:f.parentNode,l=f;k;k=k.parentNode)q.push([k,r]),l=k;l===(f.ownerDocument||e)&&q.push([l.defaultView||l.parentWindow||a,r])}for(j=0;j<q.length&&!c.isPropagationStopped();j++)k=q[j][0],c.type=q[j][1],p=(n._data(k,"events")||{})[c.type]&&n._data(k,"handle"),p&&p.apply(k,d),p=m&&k[m],p&&n.acceptData(k)&&p.apply(k,d)===!1&&c.preventDefault();return c.type=s,g||c.isDefaultPrevented()||o._default&&o._default.apply(f.ownerDocument,d)!==!1||"click"===s&&n.nodeName(f,"a")||!n.acceptData(f)||m&&f[s]&&("focus"!==s&&"blur"!==s||0!==c.target.offsetWidth)&&!n.isWindow(f)&&(l=f[m],l&&(f[m]=null),n.event.triggered=s,f[s](),n.event.triggered=b,l&&(f[m]=l)),c.result}}else{h=n.cache;for(j in h)h[j].events&&h[j].events[s]&&n.event.trigger(c,d,h[j].handle.elem,!0)}}},dispatch:function(c){c=n.event.fix(c||a.event);var d,e,f,g,h,i,j,k,l,m,p=(n._data(this,"events")||{})[c.type]||[],q=p.delegateCount,r=[].slice.call(arguments),s=!c.exclusive&&!c.namespace,t=n.event.special[c.type]||{},u=[];if(r[0]=c,c.delegateTarget=this,!t.preDispatch||t.preDispatch.call(this,c)!==!1){if(q&&(!c.button||"click"!==c.type))for(g=n(this),g.context=this,f=c.target;f!=this;f=f.parentNode||this)if(f.disabled!==!0||"click"!==c.type){for(i={},k=[],g[0]=f,d=0;q>d;d++)l=p[d],m=l.selector,i[m]===b&&(i[m]=g.is(m)),i[m]&&k.push(l);k.length&&u.push({elem:f,matches:k})}for(p.length>q&&u.push({elem:this,matches:p.slice(q)}),d=0;d<u.length&&!c.isPropagationStopped();d++)for(j=u[d],c.currentTarget=j.elem,e=0;e<j.matches.length&&!c.isImmediatePropagationStopped();e++)l=j.matches[e],(s||!c.namespace&&!l.namespace||c.namespace_re&&c.namespace_re.test(l.namespace))&&(c.data=l.data,c.handleObj=l,h=((n.event.special[l.origType]||{}).handle||l.handler).apply(j.elem,r),h!==b&&(c.result=h,h===!1&&(c.preventDefault(),c.stopPropagation())));return t.postDispatch&&t.postDispatch.call(this,c),c.result}},props:"attrChange attrName relatedNode srcElement altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),fixHooks:{},keyHooks:{props:"char charCode key keyCode".split(" "),filter:function(a,b){return null==a.which&&(a.which=null!=b.charCode?b.charCode:b.keyCode),a}},mouseHooks:{props:"button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),filter:function(a,c){var d,f,g,h=c.button,i=c.fromElement;return null==a.pageX&&null!=c.clientX&&(d=a.target.ownerDocument||e,f=d.documentElement,g=d.body,a.pageX=c.clientX+(f&&f.scrollLeft||g&&g.scrollLeft||0)-(f&&f.clientLeft||g&&g.clientLeft||0),a.pageY=c.clientY+(f&&f.scrollTop||g&&g.scrollTop||0)-(f&&f.clientTop||g&&g.clientTop||0)),!a.relatedTarget&&i&&(a.relatedTarget=i===a.target?c.toElement:i),a.which||h===b||(a.which=1&h?1:2&h?3:4&h?2:0),a}},fix:function(a){if(a[n.expando])return a;var b,c,d=a,f=n.event.fixHooks[a.type]||{},g=f.props?this.props.concat(f.props):this.props;for(a=n.Event(d),b=g.length;b;)c=g[--b],a[c]=d[c];return a.target||(a.target=d.srcElement||e),3===a.target.nodeType&&(a.target=a.target.parentNode),a.metaKey=!!a.metaKey,f.filter?f.filter(a,d):a},special:{ready:{setup:n.bindReady},load:{noBubble:!0},focus:{delegateType:"focusin"},blur:{delegateType:"focusout"},beforeunload:{setup:function(a,b,c){n.isWindow(this)&&(this.onbeforeunload=c)},teardown:function(a,b){this.onbeforeunload===b&&(this.onbeforeunload=null)}}},simulate:function(a,b,c,d){var e=n.extend(new n.Event,c,{type:a,isSimulated:!0,originalEvent:{}});d?n.event.trigger(e,null,b):n.event.dispatch.call(b,e),e.isDefaultPrevented()&&c.preventDefault()}},n.event.handle=n.event.dispatch,n.removeEvent=e.removeEventListener?function(a,b,c){a.removeEventListener&&a.removeEventListener(b,c,!1)}:function(a,b,c){var d="on"+b;a.detachEvent&&("undefined"==typeof a[d]&&(a[d]=null),a.detachEvent(d,c))},n.Event=function(a,b){return this instanceof n.Event?(a&&a.type?(this.originalEvent=a,this.type=a.type,this.isDefaultPrevented=a.defaultPrevented||a.returnValue===!1||a.getPreventDefault&&a.getPreventDefault()?_:$):this.type=a,b&&n.extend(this,b),this.timeStamp=a&&a.timeStamp||n.now(),this[n.expando]=!0,void 0):new n.Event(a,b)},n.Event.prototype={preventDefault:function(){this.isDefaultPrevented=_;var a=this.originalEvent;a&&(a.preventDefault?a.preventDefault():a.returnValue=!1)},stopPropagation:function(){this.isPropagationStopped=_;var a=this.originalEvent;a&&(a.stopPropagation&&a.stopPropagation(),a.cancelBubble=!0)},stopImmediatePropagation:function(){this.isImmediatePropagationStopped=_,this.stopPropagation()},isDefaultPrevented:$,isPropagationStopped:$,isImmediatePropagationStopped:$},n.each({mouseenter:"mouseover",mouseleave:"mouseout"},function(a,b){n.event.special[a]={delegateType:b,bindType:b,handle:function(a){var c,d=this,e=a.relatedTarget,f=a.handleObj;return f.selector,(!e||e!==d&&!n.contains(d,e))&&(a.type=f.origType,c=f.handler.apply(this,arguments),a.type=b),c}}}),n.support.submitBubbles||(n.event.special.submit={setup:function(){return n.nodeName(this,"form")?!1:(n.event.add(this,"click._submit keypress._submit",function(a){var c=a.target,d=n.nodeName(c,"input")||n.nodeName(c,"button")?c.form:b;d&&!n._data(d,"_submit_attached")&&(n.event.add(d,"submit._submit",function(a){a._submit_bubble=!0}),n._data(d,"_submit_attached",!0))}),void 0)},postDispatch:function(a){a._submit_bubble&&(delete a._submit_bubble,this.parentNode&&!a.isTrigger&&n.event.simulate("submit",this.parentNode,a,!0))},teardown:function(){return n.nodeName(this,"form")?!1:(n.event.remove(this,"._submit"),void 0)}}),n.support.changeBubbles||(n.event.special.change={setup:function(){return T.test(this.nodeName)?(("checkbox"===this.type||"radio"===this.type)&&(n.event.add(this,"propertychange._change",function(a){"checked"===a.originalEvent.propertyName&&(this._just_changed=!0)}),n.event.add(this,"click._change",function(a){this._just_changed&&!a.isTrigger&&(this._just_changed=!1),n.event.simulate("change",this,a,!0)})),!1):(n.event.add(this,"beforeactivate._change",function(a){var b=a.target;T.test(b.nodeName)&&!n._data(b,"_change_attached")&&(n.event.add(b,"change._change",function(a){!this.parentNode||a.isSimulated||a.isTrigger||n.event.simulate("change",this.parentNode,a,!0)}),n._data(b,"_change_attached",!0))}),void 0)},handle:function(a){var b=a.target;return this!==b||a.isSimulated||a.isTrigger||"radio"!==b.type&&"checkbox"!==b.type?a.handleObj.handler.apply(this,arguments):void 0},teardown:function(){return n.event.remove(this,"._change"),T.test(this.nodeName)}}),n.support.focusinBubbles||n.each({focus:"focusin",blur:"focusout"},function(a,b){var c=0,d=function(a){n.event.simulate(b,a.target,n.event.fix(a),!0)};n.event.special[b]={setup:function(){0===c++&&e.addEventListener(a,d,!0)},teardown:function(){0===--c&&e.removeEventListener(a,d,!0)}}}),n.fn.extend({on:function(a,c,d,e,f){var g,h;if("object"==typeof a){"string"!=typeof c&&(d=d||c,c=b);for(h in a)this.on(h,c,d,a[h],f);return this}if(null==d&&null==e?(e=c,d=c=b):null==e&&("string"==typeof c?(e=d,d=b):(e=d,d=c,c=b)),e===!1)e=$;else if(!e)return this;return 1===f&&(g=e,e=function(a){return n().off(a),g.apply(this,arguments)},e.guid=g.guid||(g.guid=n.guid++)),this.each(function(){n.event.add(this,a,e,d,c)})},one:function(a,b,c,d){return this.on(a,b,c,d,1)},off:function(a,c,d){var e,f;if(a&&a.preventDefault&&a.handleObj)return e=a.handleObj,n(a.delegateTarget).off(e.namespace?e.origType+"."+e.namespace:e.origType,e.selector,e.handler),this;if("object"==typeof a){for(f in a)this.off(f,c,a[f]);return this}return(c===!1||"function"==typeof c)&&(d=c,c=b),d===!1&&(d=$),this.each(function(){n.event.remove(this,a,d,c)})},bind:function(a,b,c){return this.on(a,null,b,c)},unbind:function(a,b){return this.off(a,null,b)},live:function(a,b,c){return n(this.context).on(a,this.selector,b,c),this},die:function(a,b){return n(this.context).off(a,this.selector||"**",b),this},delegate:function(a,b,c,d){return this.on(b,a,c,d)},undelegate:function(a,b,c){return 1==arguments.length?this.off(a,"**"):this.off(b,a||"**",c)},trigger:function(a,b){return this.each(function(){n.event.trigger(a,b,this)})},triggerHandler:function(a,b){return this[0]?n.event.trigger(a,b,this[0],!0):void 0},toggle:function(a){var b=arguments,c=a.guid||n.guid++,d=0,e=function(c){var e=(n._data(this,"lastToggle"+a.guid)||0)%d;return n._data(this,"lastToggle"+a.guid,e+1),c.preventDefault(),b[e].apply(this,arguments)||!1};for(e.guid=c;d<b.length;)b[d++].guid=c;return this.click(e)},hover:function(a,b){return this.mouseenter(a).mouseleave(b||a)}}),n.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "),function(a,b){n.fn[b]=function(a,c){return null==c&&(c=a,a=null),arguments.length>0?this.on(b,null,a,c):this.trigger(b)},W.test(b)&&(n.event.fixHooks[b]=n.event.keyHooks),X.test(b)&&(n.event.fixHooks[b]=n.event.mouseHooks)}),function(a,b){function db(a,b,c,d){for(var e=0,f=b.length;f>e;e++)Z(a,b[e],c,d)}function eb(a,b,c,d,e,f){var g,h=$.setFilters[b.toLowerCase()];return h||Z.error(b),(a||!(g=e))&&db(a||"*",d,g=[],e),g.length>0?h(g,c,f):[]}function fb(a,c,d,e,f){for(var g,h,i,j,k,l,m,n,o=0,q=f.length,s=L.POS,t=new RegExp("^"+s.source+"(?!"+r+")","i"),u=function(){for(var a=1,c=arguments.length-2;c>a;a++)arguments[a]===b&&(g[a]=b)};q>o;o++){for(s.exec(""),a=f[o],j=[],i=0,k=e;g=s.exec(a);)n=s.lastIndex=g.index+g[0].length,n>i&&(m=a.slice(i,g.index),i=n,l=[c],B.test(m)&&(k&&(l=k),k=e),(h=H.test(m))&&(m=m.slice(0,-5).replace(B,"$&*")),g.length>1&&g[0].replace(t,u),k=eb(m,g[1],g[2],l,k,h));k?(j=j.concat(k),(m=a.slice(i))&&")"!==m?B.test(m)?db(m,j,d,e):Z(m,c,d,e?e.concat(k):k):p.apply(d,j)):Z(a,c,d,e)}return 1===q?d:Z.uniqueSort(d)}function gb(a,b,c){for(var d,e,f,g=[],i=0,j=D.exec(a),k=!j.pop()&&!j.pop(),l=k&&a.match(C)||[""],m=$.preFilter,n=$.filter,o=!c&&b!==h;null!=(e=l[i])&&k;i++)for(g.push(d=[]),o&&(e=" "+e);e;){k=!1,(j=B.exec(e))&&(e=e.slice(j[0].length),k=d.push({part:j.pop().replace(A," "),captures:j}));for(f in n)!(j=L[f].exec(e))||m[f]&&!(j=m[f](j,b,c))||(e=e.slice(j.shift().length),k=d.push({part:f,captures:j}));if(!k)break}return k||Z.error(a),g}function hb(a,b,e){var f=b.dir,g=m++;return a||(a=function(a){return a===e}),b.first?function(b,c){for(;b=b[f];)if(1===b.nodeType)return a(b,c)&&b}:function(b,e){for(var h,i=g+"."+d,j=i+"."+c;b=b[f];)if(1===b.nodeType){if((h=b[q])===j)return b.sizset;if("string"==typeof h&&0===h.indexOf(i)){if(b.sizset)return b}else{if(b[q]=j,a(b,e))return b.sizset=!0,b;b.sizset=!1}}}}function ib(a,b){return a?function(c,d){var e=b(c,d);return e&&a(e===!0?c:e,d)}:b}function jb(a,b,c){for(var d,e,f=0;d=a[f];f++)$.relative[d.part]?e=hb(e,$.relative[d.part],b):(d.captures.push(b,c),e=ib(e,$.filter[d.part].apply(null,d.captures)));return e}function kb(a){return function(b,c){for(var d,e=0;d=a[e];e++)if(d(b,c))return!0;return!1}}var c,d,e,f,g,h=a.document,i=h.documentElement,j="undefined",k=!1,l=!0,m=0,o=[].slice,p=[].push,q=("sizcache"+Math.random()).replace(".",""),r="[\\x20\\t\\r\\n\\f]",s="(?:\\\\.|[-\\w]|[^\\x00-\\xa0])+",t=s.replace("w","w#"),u="([*^$|!~]?=)",v="\\["+r+"*("+s+")"+r+"*(?:"+u+r+"*(?:(['\"])((?:\\\\.|[^\\\\])*?)\\3|("+t+")|)|)"+r+"*\\]",w=":("+s+")(?:\\((?:(['\"])((?:\\\\.|[^\\\\])*?)\\2|((?:[^,]|\\\\,|(?:,(?=[^\\[]*\\]))|(?:,(?=[^\\(]*\\))))*))\\)|)",x=":(nth|eq|gt|lt|first|last|even|odd)(?:\\((\\d*)\\)|)(?=[^-]|$)",y=r+"*([\\x20\\t\\r\\n\\f>+~])"+r+"*",z="(?=[^\\x20\\t\\r\\n\\f])(?:\\\\.|"+v+"|"+w.replace(2,7)+"|[^\\\\(),])+",A=new RegExp("^"+r+"+|((?:^|[^\\\\])(?:\\\\.)*)"+r+"+$","g"),B=new RegExp("^"+y),C=new RegExp(z+"?(?="+r+"*,|$)","g"),D=new RegExp("^(?:(?!,)(?:(?:^|,)"+r+"*"+z+")*?|"+r+"*(.*?))(\\)|$)"),E=new RegExp(z.slice(19,-6)+"\\x20\\t\\r\\n\\f>+~])+|"+y,"g"),F=/^(?:#([\w\-]+)|(\w+)|\.([\w\-]+))$/,G=/[\x20\t\r\n\f]*[+~]/,H=/:not\($/,I=/h\d/i,J=/input|select|textarea|button/i,K=/\\(?!\\)/g,L={ID:new RegExp("^#("+s+")"),CLASS:new RegExp("^\\.("+s+")"),NAME:new RegExp("^\\[name=['\"]?("+s+")['\"]?\\]"),TAG:new RegExp("^("+s.replace("[-","[-\\*")+")"),ATTR:new RegExp("^"+v),PSEUDO:new RegExp("^"+w),CHILD:new RegExp("^:(only|nth|last|first)-child(?:\\("+r+"*(even|odd|(([+-]|)(\\d*)n|)"+r+"*(?:([+-]|)"+r+"*(\\d+)|))"+r+"*\\)|)","i"),POS:new RegExp(x,"ig"),needsContext:new RegExp("^"+r+"*[>+~]|"+x,"i")},M={},N=[],O={},P=[],Q=function(a){return a.sizzleFilter=!0,a},R=function(a){return function(b){return"input"===b.nodeName.toLowerCase()&&b.type===a}},S=function(a){return function(b){var c=b.nodeName.toLowerCase();return("input"===c||"button"===c)&&b.type===a}},T=function(a){var b=!1,c=h.createElement("div");try{b=a(c)}catch(d){}return c=null,b},U=T(function(a){a.innerHTML="<select></select>";var b=typeof a.lastChild.getAttribute("multiple");return"boolean"!==b&&"string"!==b}),V=T(function(a){a.id=q+0,a.innerHTML="<a name='"+q+"'></a><div name='"+q+"'></div>",i.insertBefore(a,i.firstChild);var b=h.getElementsByName&&h.getElementsByName(q).length===2+h.getElementsByName(q+0).length;return g=!h.getElementById(q),i.removeChild(a),b}),W=T(function(a){return a.appendChild(h.createComment("")),0===a.getElementsByTagName("*").length}),X=T(function(a){return a.innerHTML="<a href='#'></a>",a.firstChild&&typeof a.firstChild.getAttribute!==j&&"#"===a.firstChild.getAttribute("href")}),Y=T(function(a){return a.innerHTML="<div class='hidden e'></div><div class='hidden'></div>",a.getElementsByClassName&&0!==a.getElementsByClassName("e").length?(a.lastChild.className="e",1!==a.getElementsByClassName("e").length):!1}),Z=function(a,b,c,d){c=c||[],b=b||h;var e,f,g,i,j=b.nodeType;if(1!==j&&9!==j)return[];if(!a||"string"!=typeof a)return c;if(g=ab(b),!g&&!d&&(e=F.exec(a)))if(i=e[1]){if(9===j){if(f=b.getElementById(i),!f||!f.parentNode)return c;if(f.id===i)return c.push(f),c}else if(b.ownerDocument&&(f=b.ownerDocument.getElementById(i))&&bb(b,f)&&f.id===i)return c.push(f),c}else{if(e[2])return p.apply(c,o.call(b.getElementsByTagName(a),0)),c;if((i=e[3])&&Y&&b.getElementsByClassName)return p.apply(c,o.call(b.getElementsByClassName(i),0)),c}return mb(a,b,c,d,g)},$=Z.selectors={cacheLength:50,match:L,order:["ID","TAG"],attrHandle:{},createPseudo:Q,find:{ID:g?function(a,b,c){if(typeof b.getElementById!==j&&!c){var d=b.getElementById(a);return d&&d.parentNode?[d]:[]}}:function(a,c,d){if(typeof c.getElementById!==j&&!d){var e=c.getElementById(a);return e?e.id===a||typeof e.getAttributeNode!==j&&e.getAttributeNode("id").value===a?[e]:b:[]}},TAG:W?function(a,b){return typeof b.getElementsByTagName!==j?b.getElementsByTagName(a):void 0}:function(a,b){var c=b.getElementsByTagName(a);if("*"===a){for(var d,e=[],f=0;d=c[f];f++)1===d.nodeType&&e.push(d);return e}return c}},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(a){return a[1]=a[1].replace(K,""),a[3]=(a[4]||a[5]||"").replace(K,""),"~="===a[2]&&(a[3]=" "+a[3]+" "),a.slice(0,4)},CHILD:function(a){return a[1]=a[1].toLowerCase(),"nth"===a[1]?(a[2]||Z.error(a[0]),a[3]=+(a[3]?a[4]+(a[5]||1):2*("even"===a[2]||"odd"===a[2])),a[4]=+(a[6]+a[7]||"odd"===a[2])):a[2]&&Z.error(a[0]),a},PSEUDO:function(a){var b,c=a[4];return L.CHILD.test(a[0])?null:(c&&(b=D.exec(c))&&b.pop()&&(a[0]=a[0].slice(0,b[0].length-c.length-1),c=b[0].slice(0,-1)),a.splice(2,3,c||a[3]),a)}},filter:{ID:g?function(a){return a=a.replace(K,""),function(b){return b.getAttribute("id")===a}}:function(a){return a=a.replace(K,""),function(b){var c=typeof b.getAttributeNode!==j&&b.getAttributeNode("id");return c&&c.value===a}},TAG:function(a){return"*"===a?function(){return!0}:(a=a.replace(K,"").toLowerCase(),function(b){return b.nodeName&&b.nodeName.toLowerCase()===a})},CLASS:function(a){var b=M[a];return b||(b=M[a]=new RegExp("(^|"+r+")"+a+"("+r+"|$)"),N.push(a),N.length>$.cacheLength&&delete M[N.shift()]),function(a){return b.test(a.className||typeof a.getAttribute!==j&&a.getAttribute("class")||"")}},ATTR:function(a,b,c){return b?function(d){var e=Z.attr(d,a),f=e+"";if(null==e)return"!="===b;switch(b){case"=":return f===c;case"!=":return f!==c;case"^=":return c&&0===f.indexOf(c);case"*=":return c&&f.indexOf(c)>-1;case"$=":return c&&f.substr(f.length-c.length)===c;case"~=":return(" "+f+" ").indexOf(c)>-1;case"|=":return f===c||f.substr(0,c.length+1)===c+"-"}}:function(b){return null!=Z.attr(b,a)}},CHILD:function(a,b,c,d){if("nth"===a){var e=m++;return function(a){var b,f,g=0,h=a;if(1===c&&0===d)return!0;if(b=a.parentNode,b&&(b[q]!==e||!a.sizset)){for(h=b.firstChild;h&&(1!==h.nodeType||(h.sizset=++g,h!==a));h=h.nextSibling);b[q]=e}return f=a.sizset-d,0===c?0===f:0===f%c&&f/c>=0}}return function(b){var c=b;switch(a){case"only":case"first":for(;c=c.previousSibling;)if(1===c.nodeType)return!1;if("first"===a)return!0;c=b;case"last":for(;c=c.nextSibling;)if(1===c.nodeType)return!1;return!0}}},PSEUDO:function(a,b,c,d){var e=$.pseudos[a]||$.pseudos[a.toLowerCase()];return e||Z.error("unsupported pseudo: "+a),e.sizzleFilter?e(b,c,d):e}},pseudos:{not:Q(function(a,b,c){var d=lb(a.replace(A,"$1"),b,c);return function(a){return!d(a)}}),enabled:function(a){return a.disabled===!1},disabled:function(a){return a.disabled===!0},checked:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&!!a.checked||"option"===b&&!!a.selected},selected:function(a){return a.parentNode&&a.parentNode.selectedIndex,a.selected===!0},parent:function(a){return!$.pseudos.empty(a)},empty:function(a){var b;for(a=a.firstChild;a;){if(a.nodeName>"@"||3===(b=a.nodeType)||4===b)return!1;a=a.nextSibling}return!0},contains:Q(function(a){return function(b){return(b.textContent||b.innerText||cb(b)).indexOf(a)>-1}}),has:Q(function(a){return function(b){return Z(a,b).length>0}}),header:function(a){return I.test(a.nodeName)},text:function(a){var b,c;return"input"===a.nodeName.toLowerCase()&&"text"===(b=a.type)&&(null==(c=a.getAttribute("type"))||c.toLowerCase()===b)},radio:R("radio"),checkbox:R("checkbox"),file:R("file"),password:R("password"),image:R("image"),submit:S("submit"),reset:S("reset"),button:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&"button"===a.type||"button"===b},input:function(a){return J.test(a.nodeName)},focus:function(a){var b=a.ownerDocument;return!(a!==b.activeElement||b.hasFocus&&!b.hasFocus()||!a.type&&!a.href)},active:function(a){return a===a.ownerDocument.activeElement}},setFilters:{first:function(a,b,c){return c?a.slice(1):[a[0]]},last:function(a,b,c){var d=a.pop();return c?a:[d]},even:function(a,b,c){for(var d=[],e=c?1:0,f=a.length;f>e;e+=2)d.push(a[e]);return d},odd:function(a,b,c){for(var d=[],e=c?0:1,f=a.length;f>e;e+=2)d.push(a[e]);return d},lt:function(a,b,c){return c?a.slice(+b):a.slice(0,+b)},gt:function(a,b,c){return c?a.slice(0,+b+1):a.slice(+b+1)},eq:function(a,b,c){var d=a.splice(+b,1);return c?a:d}}};$.setFilters.nth=$.setFilters.eq,$.filters=$.pseudos,X||($.attrHandle={href:function(a){return a.getAttribute("href",2)},type:function(a){return a.getAttribute("type")}}),V&&($.order.push("NAME"),$.find.NAME=function(a,b){return typeof b.getElementsByName!==j?b.getElementsByName(a):void 0}),Y&&($.order.splice(1,0,"CLASS"),$.find.CLASS=function(a,b,c){return typeof b.getElementsByClassName===j||c?void 0:b.getElementsByClassName(a)});try{o.call(i.childNodes,0)[0].nodeType}catch(_){o=function(a){for(var b,c=[];b=this[a];a++)c.push(b);return c}}var ab=Z.isXML=function(a){var b=a&&(a.ownerDocument||a).documentElement;return b?"HTML"!==b.nodeName:!1},bb=Z.contains=i.compareDocumentPosition?function(a,b){return!!(16&a.compareDocumentPosition(b))}:i.contains?function(a,b){var c=9===a.nodeType?a.documentElement:a,d=b.parentNode;return a===d||!!(d&&1===d.nodeType&&c.contains&&c.contains(d))}:function(a,b){for(;b=b.parentNode;)if(b===a)return!0;return!1},cb=Z.getText=function(a){var b,c="",d=0,e=a.nodeType;if(e){if(1===e||9===e||11===e){if("string"==typeof a.textContent)return a.textContent;for(a=a.firstChild;a;a=a.nextSibling)c+=cb(a)}else if(3===e||4===e)return a.nodeValue}else for(;b=a[d];d++)c+=cb(b);return c};Z.attr=function(a,b){var c,d=ab(a);return d||(b=b.toLowerCase()),$.attrHandle[b]?$.attrHandle[b](a):U||d?a.getAttribute(b):(c=a.getAttributeNode(b),c?"boolean"==typeof a[b]?a[b]?b:null:c.specified?c.value:null:null)},Z.error=function(a){throw new Error("Syntax error, unrecognized expression: "+a)},[0,0].sort(function(){return l=0}),i.compareDocumentPosition?e=function(a,b){return a===b?(k=!0,0):(a.compareDocumentPosition&&b.compareDocumentPosition?4&a.compareDocumentPosition(b):a.compareDocumentPosition)?-1:1}:(e=function(a,b){if(a===b)return k=!0,0;if(a.sourceIndex&&b.sourceIndex)return a.sourceIndex-b.sourceIndex;var c,d,e=[],g=[],h=a.parentNode,i=b.parentNode,j=h;if(h===i)return f(a,b);if(!h)return-1;if(!i)return 1;for(;j;)e.unshift(j),j=j.parentNode;for(j=i;j;)g.unshift(j),j=j.parentNode;c=e.length,d=g.length;for(var l=0;c>l&&d>l;l++)if(e[l]!==g[l])return f(e[l],g[l]);return l===c?f(a,g[l],-1):f(e[l],b,1)},f=function(a,b,c){if(a===b)return c;for(var d=a.nextSibling;d;){if(d===b)return-1;d=d.nextSibling}return 1}),Z.uniqueSort=function(a){var b,c=1;if(e&&(k=l,a.sort(e),k))for(;b=a[c];c++)b===a[c-1]&&a.splice(c--,1);return a};var lb=Z.compile=function(a,b,c){var d,e,f,g=O[a];if(g&&g.context===b)return g;for(e=gb(a,b,c),f=0;d=e[f];f++)e[f]=jb(d,b,c);return g=O[a]=kb(e),g.context=b,g.runs=g.dirruns=0,P.push(a),P.length>$.cacheLength&&delete O[P.shift()],g};Z.matches=function(a,b){return Z(a,null,null,b)},Z.matchesSelector=function(a,b){return Z(b,null,null,[a]).length>0};var mb=function(a,b,e,f,g){a=a.replace(A,"$1");var h,i,j,k,l,m,n,q,r,s=a.match(C),t=a.match(E),u=b.nodeType;if(L.POS.test(a))return fb(a,b,e,f,s);if(f)h=o.call(f,0);else if(s&&1===s.length){if(t.length>1&&9===u&&!g&&(s=L.ID.exec(t[0]))){if(b=$.find.ID(s[1],b,g)[0],!b)return e;a=a.slice(t.shift().length)}for(q=(s=G.exec(t[0]))&&!s.index&&b.parentNode||b,r=t.pop(),m=r.split(":not")[0],j=0,k=$.order.length;k>j;j++)if(n=$.order[j],s=L[n].exec(m)){if(h=$.find[n]((s[1]||"").replace(K,""),q,g),null==h)continue;m===r&&(a=a.slice(0,a.length-r.length)+m.replace(L[n],""),a||p.apply(e,o.call(h,0)));break}}if(a)for(i=lb(a,b,g),d=i.dirruns++,null==h&&(h=$.find.TAG("*",G.test(a)&&b.parentNode||b)),j=0;l=h[j];j++)c=i.runs++,i(l,b)&&e.push(l);return e};h.querySelectorAll&&function(){var a,b=mb,c=/'|\\/g,d=/\=[\x20\t\r\n\f]*([^'"\]]*)[\x20\t\r\n\f]*\]/g,e=[],f=[":active"],g=i.matchesSelector||i.mozMatchesSelector||i.webkitMatchesSelector||i.oMatchesSelector||i.msMatchesSelector;T(function(a){a.innerHTML="<select><option selected></option></select>",a.querySelectorAll("[selected]").length||e.push("\\["+r+"*(?:checked|disabled|ismap|multiple|readonly|selected|value)"),a.querySelectorAll(":checked").length||e.push(":checked")}),T(function(a){a.innerHTML="<p test=''></p>",a.querySelectorAll("[test^='']").length&&e.push("[*^$]="+r+"*(?:\"\"|'')"),a.innerHTML="<input type='hidden'>",a.querySelectorAll(":enabled").length||e.push(":enabled",":disabled")}),e=e.length&&new RegExp(e.join("|")),mb=function(a,d,f,g,h){if(!(g||h||e&&e.test(a)))if(9===d.nodeType)try{return p.apply(f,o.call(d.querySelectorAll(a),0)),f}catch(i){}else if(1===d.nodeType&&"object"!==d.nodeName.toLowerCase()){var j=d.getAttribute("id"),k=j||q,l=G.test(a)&&d.parentNode||d;j?k=k.replace(c,"\\$&"):d.setAttribute("id",k);try{return p.apply(f,o.call(l.querySelectorAll(a.replace(C,"[id='"+k+"'] $&")),0)),f}catch(i){}finally{j||d.removeAttribute("id")}}return b(a,d,f,g,h)},g&&(T(function(b){a=g.call(b,"div");try{g.call(b,"[test!='']:sizzle"),f.push($.match.PSEUDO)}catch(c){}}),f=new RegExp(f.join("|")),Z.matchesSelector=function(b,c){if(c=c.replace(d,"='$1']"),!(ab(b)||f.test(c)||e&&e.test(c)))try{var h=g.call(b,c);if(h||a||b.document&&11!==b.document.nodeType)return h}catch(i){}return Z(c,null,null,[b]).length>0})}(),Z.attr=n.attr,n.find=Z,n.expr=Z.selectors,n.expr[":"]=n.expr.pseudos,n.unique=Z.uniqueSort,n.text=Z.getText,n.isXMLDoc=Z.isXML,n.contains=Z.contains}(a);var ab=/Until$/,bb=/^(?:parents|prev(?:Until|All))/,cb=/^.[^:#\[\.,]*$/,db=n.expr.match.needsContext,eb={children:!0,contents:!0,next:!0,prev:!0};n.fn.extend({find:function(a){var b,c,d,e,f,g,h=this;if("string"!=typeof a)return n(a).filter(function(){for(b=0,c=h.length;c>b;b++)if(n.contains(h[b],this))return!0});for(g=this.pushStack("","find",a),b=0,c=this.length;c>b;b++)if(d=g.length,n.find(a,this[b],g),b>0)for(e=d;e<g.length;e++)for(f=0;d>f;f++)if(g[f]===g[e]){g.splice(e--,1);break}return g},has:function(a){var b,c=n(a,this),d=c.length;return this.filter(function(){for(b=0;d>b;b++)if(n.contains(this,c[b]))return!0})},not:function(a){return this.pushStack(hb(this,a,!1),"not",a)},filter:function(a){return this.pushStack(hb(this,a,!0),"filter",a)},is:function(a){return!!a&&("string"==typeof a?db.test(a)?n(a,this.context).index(this[0])>=0:n.filter(a,this).length>0:this.filter(a).length>0)},closest:function(a,b){for(var c,d=0,e=this.length,f=[],g=db.test(a)||"string"!=typeof a?n(a,b||this.context):0;e>d;d++)for(c=this[d];c&&c.ownerDocument&&c!==b&&11!==c.nodeType;){if(g?g.index(c)>-1:n.find.matchesSelector(c,a)){f.push(c);break}c=c.parentNode}return f=f.length>1?n.unique(f):f,this.pushStack(f,"closest",a)},index:function(a){return a?"string"==typeof a?n.inArray(this[0],n(a)):n.inArray(a.jquery?a[0]:a,this):this[0]&&this[0].parentNode?this.prevAll().length:-1},add:function(a,b){var c="string"==typeof a?n(a,b):n.makeArray(a&&a.nodeType?[a]:a),d=n.merge(this.get(),c);return this.pushStack(fb(c[0])||fb(d[0])?d:n.unique(d))},addBack:function(a){return this.add(null==a?this.prevObject:this.prevObject.filter(a))}}),n.fn.andSelf=n.fn.addBack,n.each({parent:function(a){var b=a.parentNode;return b&&11!==b.nodeType?b:null},parents:function(a){return n.dir(a,"parentNode")},parentsUntil:function(a,b,c){return n.dir(a,"parentNode",c)},next:function(a){return gb(a,"nextSibling")},prev:function(a){return gb(a,"previousSibling")},nextAll:function(a){return n.dir(a,"nextSibling")},prevAll:function(a){return n.dir(a,"previousSibling")},nextUntil:function(a,b,c){return n.dir(a,"nextSibling",c)},prevUntil:function(a,b,c){return n.dir(a,"previousSibling",c)},siblings:function(a){return n.sibling((a.parentNode||{}).firstChild,a)},children:function(a){return n.sibling(a.firstChild)},contents:function(a){return n.nodeName(a,"iframe")?a.contentDocument||a.contentWindow.document:n.merge([],a.childNodes)}},function(a,b){n.fn[a]=function(c,d){var e=n.map(this,b,c);return ab.test(a)||(d=c),d&&"string"==typeof d&&(e=n.filter(d,e)),e=this.length>1&&!eb[a]?n.unique(e):e,this.length>1&&bb.test(a)&&(e=e.reverse()),this.pushStack(e,a,i.call(arguments).join(","))}}),n.extend({filter:function(a,b,c){return c&&(a=":not("+a+")"),1===b.length?n.find.matchesSelector(b[0],a)?[b[0]]:[]:n.find.matches(a,b)},dir:function(a,c,d){for(var e=[],f=a[c];f&&9!==f.nodeType&&(d===b||1!==f.nodeType||!n(f).is(d));)1===f.nodeType&&e.push(f),f=f[c];return e},sibling:function(a,b){for(var c=[];a;a=a.nextSibling)1===a.nodeType&&a!==b&&c.push(a);return c}});var jb="abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",kb=/ jQuery\d+="(?:null|\d+)"/g,lb=/^\s+/,mb=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,nb=/<([\w:]+)/,ob=/<tbody/i,pb=/<|&#?\w+;/,qb=/<(?:script|style|link)/i,rb=/<(?:script|object|embed|option|style)/i,sb=new RegExp("<(?:"+jb+")[\\s/>]","i"),tb=/^(?:checkbox|radio)$/,ub=/checked\s*(?:[^=]|=\s*.checked.)/i,vb=/\/(java|ecma)script/i,wb=/^\s*<!(?:\[CDATA\[|\-\-)|[\]\-]{2}>\s*$/g,xb={option:[1,"<select multiple='multiple'>","</select>"],legend:[1,"<fieldset>","</fieldset>"],thead:[1,"<table>","</table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],col:[2,"<table><tbody></tbody><colgroup>","</colgroup></table>"],area:[1,"<map>","</map>"],_default:[0,"",""]},yb=ib(e),zb=yb.appendChild(e.createElement("div"));xb.optgroup=xb.option,xb.tbody=xb.tfoot=xb.colgroup=xb.caption=xb.thead,xb.th=xb.td,n.support.htmlSerialize||(xb._default=[1,"X<div>","</div>"]),n.fn.extend({text:function(a){return n.access(this,function(a){return a===b?n.text(this):this.empty().append((this[0]&&this[0].ownerDocument||e).createTextNode(a)) },null,a,arguments.length)},wrapAll:function(a){if(n.isFunction(a))return this.each(function(b){n(this).wrapAll(a.call(this,b))});if(this[0]){var b=n(a,this[0].ownerDocument).eq(0).clone(!0);this[0].parentNode&&b.insertBefore(this[0]),b.map(function(){for(var a=this;a.firstChild&&1===a.firstChild.nodeType;)a=a.firstChild;return a}).append(this)}return this},wrapInner:function(a){return n.isFunction(a)?this.each(function(b){n(this).wrapInner(a.call(this,b))}):this.each(function(){var b=n(this),c=b.contents();c.length?c.wrapAll(a):b.append(a)})},wrap:function(a){var b=n.isFunction(a);return this.each(function(c){n(this).wrapAll(b?a.call(this,c):a)})},unwrap:function(){return this.parent().each(function(){n.nodeName(this,"body")||n(this).replaceWith(this.childNodes)}).end()},append:function(){return this.domManip(arguments,!0,function(a){(1===this.nodeType||11===this.nodeType)&&this.appendChild(a)})},prepend:function(){return this.domManip(arguments,!0,function(a){(1===this.nodeType||11===this.nodeType)&&this.insertBefore(a,this.firstChild)})},before:function(){if(!fb(this[0]))return this.domManip(arguments,!1,function(a){this.parentNode.insertBefore(a,this)});if(arguments.length){var a=n.clean(arguments);return this.pushStack(n.merge(a,this),"before",this.selector)}},after:function(){if(!fb(this[0]))return this.domManip(arguments,!1,function(a){this.parentNode.insertBefore(a,this.nextSibling)});if(arguments.length){var a=n.clean(arguments);return this.pushStack(n.merge(this,a),"after",this.selector)}},remove:function(a,b){for(var c,d=0;null!=(c=this[d]);d++)(!a||n.filter(a,[c]).length)&&(b||1!==c.nodeType||(n.cleanData(c.getElementsByTagName("*")),n.cleanData([c])),c.parentNode&&c.parentNode.removeChild(c));return this},empty:function(){for(var a,b=0;null!=(a=this[b]);b++)for(1===a.nodeType&&n.cleanData(a.getElementsByTagName("*"));a.firstChild;)a.removeChild(a.firstChild);return this},clone:function(a,b){return a=null==a?!1:a,b=null==b?a:b,this.map(function(){return n.clone(this,a,b)})},html:function(a){return n.access(this,function(a){var c=this[0]||{},d=0,e=this.length;if(a===b)return 1===c.nodeType?c.innerHTML.replace(kb,""):b;if(!("string"!=typeof a||qb.test(a)||!n.support.htmlSerialize&&sb.test(a)||!n.support.leadingWhitespace&&lb.test(a)||xb[(nb.exec(a)||["",""])[1].toLowerCase()])){a=a.replace(mb,"<$1></$2>");try{for(;e>d;d++)c=this[d]||{},1===c.nodeType&&(n.cleanData(c.getElementsByTagName("*")),c.innerHTML=a);c=0}catch(f){}}c&&this.empty().append(a)},null,a,arguments.length)},replaceWith:function(a){return fb(this[0])?this.length?this.pushStack(n(n.isFunction(a)?a():a),"replaceWith",a):this:n.isFunction(a)?this.each(function(b){var c=n(this),d=c.html();c.replaceWith(a.call(this,b,d))}):("string"!=typeof a&&(a=n(a).detach()),this.each(function(){var b=this.nextSibling,c=this.parentNode;n(this).remove(),b?n(b).before(a):n(c).append(a)}))},detach:function(a){return this.remove(a,!0)},domManip:function(a,c,d){a=[].concat.apply([],a);var e,f,g,h,i=0,j=a[0],k=[],l=this.length;if(!n.support.checkClone&&l>1&&"string"==typeof j&&ub.test(j))return this.each(function(){n(this).domManip(a,c,d)});if(n.isFunction(j))return this.each(function(e){var f=n(this);a[0]=j.call(this,e,c?f.html():b),f.domManip(a,c,d)});if(this[0]){if(e=n.buildFragment(a,this,k),g=e.fragment,f=g.firstChild,1===g.childNodes.length&&(g=f),f)for(c=c&&n.nodeName(f,"tr"),h=e.cacheable||l-1;l>i;i++)d.call(c&&n.nodeName(this[i],"table")?Ab(this[i],"tbody"):this[i],i===h?g:n.clone(g,!0,!0));g=f=null,k.length&&n.each(k,function(a,b){b.src?n.ajax?n.ajax({url:b.src,type:"GET",dataType:"script",async:!1,global:!1,"throws":!0}):n.error("no ajax"):n.globalEval((b.text||b.textContent||b.innerHTML||"").replace(wb,"")),b.parentNode&&b.parentNode.removeChild(b)})}return this}}),n.buildFragment=function(a,c,d){var f,g,h,i=a[0];return c=c||e,c=(c[0]||c).ownerDocument||c[0]||c,"undefined"==typeof c.createDocumentFragment&&(c=e),!(1===a.length&&"string"==typeof i&&i.length<512&&c===e&&"<"===i.charAt(0))||rb.test(i)||!n.support.checkClone&&ub.test(i)||!n.support.html5Clone&&sb.test(i)||(g=!0,f=n.fragments[i],h=f!==b),f||(f=c.createDocumentFragment(),n.clean(a,c,f,d),g&&(n.fragments[i]=h&&f)),{fragment:f,cacheable:g}},n.fragments={},n.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(a,b){n.fn[a]=function(c){var d,e=0,f=[],g=n(c),h=g.length,i=1===this.length&&this[0].parentNode;if((null==i||i&&11===i.nodeType&&1===i.childNodes.length)&&1===h)return g[b](this[0]),this;for(;h>e;e++)d=(e>0?this.clone(!0):this).get(),n(g[e])[b](d),f=f.concat(d);return this.pushStack(f,a,g.selector)}}),n.extend({clone:function(a,b,c){var d,e,f,g;if(n.support.html5Clone||n.isXMLDoc(a)||!sb.test("<"+a.nodeName+">")?g=a.cloneNode(!0):(zb.innerHTML=a.outerHTML,zb.removeChild(g=zb.firstChild)),!(n.support.noCloneEvent&&n.support.noCloneChecked||1!==a.nodeType&&11!==a.nodeType||n.isXMLDoc(a)))for(Cb(a,g),d=Db(a),e=Db(g),f=0;d[f];++f)e[f]&&Cb(d[f],e[f]);if(b&&(Bb(a,g),c))for(d=Db(a),e=Db(g),f=0;d[f];++f)Bb(d[f],e[f]);return d=e=null,g},clean:function(a,b,c,d){var f,g,h,i,j,k,l,m,o,q,r,s=0,t=[];for(b&&"undefined"!=typeof b.createDocumentFragment||(b=e),g=b===e&&yb;null!=(h=a[s]);s++)if("number"==typeof h&&(h+=""),h){if("string"==typeof h)if(pb.test(h)){for(g=g||ib(b),l=l||g.appendChild(b.createElement("div")),h=h.replace(mb,"<$1></$2>"),i=(nb.exec(h)||["",""])[1].toLowerCase(),j=xb[i]||xb._default,k=j[0],l.innerHTML=j[1]+h+j[2];k--;)l=l.lastChild;if(!n.support.tbody)for(m=ob.test(h),o="table"!==i||m?"<table>"!==j[1]||m?[]:l.childNodes:l.firstChild&&l.firstChild.childNodes,f=o.length-1;f>=0;--f)n.nodeName(o[f],"tbody")&&!o[f].childNodes.length&&o[f].parentNode.removeChild(o[f]);!n.support.leadingWhitespace&&lb.test(h)&&l.insertBefore(b.createTextNode(lb.exec(h)[0]),l.firstChild),h=l.childNodes,l=g.lastChild}else h=b.createTextNode(h);h.nodeType?t.push(h):t=n.merge(t,h)}if(l&&(g.removeChild(l),h=l=g=null),!n.support.appendChecked)for(s=0;null!=(h=t[s]);s++)n.nodeName(h,"input")?Eb(h):"undefined"!=typeof h.getElementsByTagName&&n.grep(h.getElementsByTagName("input"),Eb);if(c)for(q=function(a){return!a.type||vb.test(a.type)?d?d.push(a.parentNode?a.parentNode.removeChild(a):a):c.appendChild(a):void 0},s=0;null!=(h=t[s]);s++)n.nodeName(h,"script")&&q(h)||(c.appendChild(h),"undefined"!=typeof h.getElementsByTagName&&(r=n.grep(n.merge([],h.getElementsByTagName("script")),q),t.splice.apply(t,[s+1,0].concat(r)),s+=r.length));return t},cleanData:function(a,b){for(var c,d,e,f,g=0,h=n.expando,i=n.cache,j=n.support.deleteExpando,k=n.event.special;null!=(e=a[g]);g++)if((b||n.acceptData(e))&&(d=e[h],c=d&&i[d])){if(c.events)for(f in c.events)k[f]?n.event.remove(e,f):n.removeEvent(e,f,c.handle);i[d]&&(delete i[d],j?delete e[h]:e.removeAttribute?e.removeAttribute(h):e[h]=null,n.deletedIds.push(d))}}}),function(){var a,b;n.uaMatch=function(a){a=a.toLowerCase();var b=/(chrome)[ \/]([\w.]+)/.exec(a)||/(webkit)[ \/]([\w.]+)/.exec(a)||/(opera)(?:.*version|)[ \/]([\w.]+)/.exec(a)||/(msie) ([\w.]+)/.exec(a)||a.indexOf("compatible")<0&&/(mozilla)(?:.*? rv:([\w.]+)|)/.exec(a)||[];return{browser:b[1]||"",version:b[2]||"0"}},a=n.uaMatch(g.userAgent),b={},a.browser&&(b[a.browser]=!0,b.version=a.version),b.webkit&&(b.safari=!0),n.browser=b,n.sub=function(){function a(b,c){return new a.fn.init(b,c)}n.extend(!0,a,this),a.superclass=this,a.fn=a.prototype=this(),a.fn.constructor=a,a.sub=this.sub,a.fn.init=function(c,d){return d&&d instanceof n&&!(d instanceof a)&&(d=a(d)),n.fn.init.call(this,c,d,b)},a.fn.init.prototype=a.fn;var b=a(e);return a}}();var Fb,Gb,Hb,Ib=/alpha\([^)]*\)/i,Jb=/opacity=([^)]*)/,Kb=/^(top|right|bottom|left)$/,Lb=/^margin/,Mb=new RegExp("^("+o+")(.*)$","i"),Nb=new RegExp("^("+o+")(?!px)[a-z%]+$","i"),Ob=new RegExp("^([-+])=("+o+")","i"),Pb={},Qb={position:"absolute",visibility:"hidden",display:"block"},Rb={letterSpacing:0,fontWeight:400,lineHeight:1},Sb=["Top","Right","Bottom","Left"],Tb=["Webkit","O","Moz","ms"],Ub=n.fn.toggle;n.fn.extend({css:function(a,c){return n.access(this,function(a,c,d){return d!==b?n.style(a,c,d):n.css(a,c)},a,c,arguments.length>1)},show:function(){return Xb(this,!0)},hide:function(){return Xb(this)},toggle:function(a,b){var c="boolean"==typeof a;return n.isFunction(a)&&n.isFunction(b)?Ub.apply(this,arguments):this.each(function(){(c?a:Wb(this))?n(this).show():n(this).hide()})}}),n.extend({cssHooks:{opacity:{get:function(a,b){if(b){var c=Fb(a,"opacity");return""===c?"1":c}}}},cssNumber:{fillOpacity:!0,fontWeight:!0,lineHeight:!0,opacity:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{"float":n.support.cssFloat?"cssFloat":"styleFloat"},style:function(a,c,d,e){if(a&&3!==a.nodeType&&8!==a.nodeType&&a.style){var f,g,h,i=n.camelCase(c),j=a.style;if(c=n.cssProps[i]||(n.cssProps[i]=Vb(j,i)),h=n.cssHooks[c]||n.cssHooks[i],d===b)return h&&"get"in h&&(f=h.get(a,!1,e))!==b?f:j[c];if(g=typeof d,"string"===g&&(f=Ob.exec(d))&&(d=(f[1]+1)*f[2]+parseFloat(n.css(a,c)),g="number"),!(null==d||"number"===g&&isNaN(d)||("number"!==g||n.cssNumber[i]||(d+="px"),h&&"set"in h&&(d=h.set(a,d,e))===b)))try{j[c]=d}catch(k){}}},css:function(a,c,d,e){var f,g,h,i=n.camelCase(c);return c=n.cssProps[i]||(n.cssProps[i]=Vb(a.style,i)),h=n.cssHooks[c]||n.cssHooks[i],h&&"get"in h&&(f=h.get(a,!0,e)),f===b&&(f=Fb(a,c)),"normal"===f&&c in Rb&&(f=Rb[c]),d||e!==b?(g=parseFloat(f),d||n.isNumeric(g)?g||0:f):f},swap:function(a,b,c){var d,e,f={};for(e in b)f[e]=a.style[e],a.style[e]=b[e];d=c.call(a);for(e in b)a.style[e]=f[e];return d}}),a.getComputedStyle?Fb=function(a,b){var c,d,e,f,g=getComputedStyle(a,null),h=a.style;return g&&(c=g[b],""!==c||n.contains(a.ownerDocument.documentElement,a)||(c=n.style(a,b)),Nb.test(c)&&Lb.test(b)&&(d=h.width,e=h.minWidth,f=h.maxWidth,h.minWidth=h.maxWidth=h.width=c,c=g.width,h.width=d,h.minWidth=e,h.maxWidth=f)),c}:e.documentElement.currentStyle&&(Fb=function(a,b){var c,d,e=a.currentStyle&&a.currentStyle[b],f=a.style;return null==e&&f&&f[b]&&(e=f[b]),Nb.test(e)&&!Kb.test(b)&&(c=f.left,d=a.runtimeStyle&&a.runtimeStyle.left,d&&(a.runtimeStyle.left=a.currentStyle.left),f.left="fontSize"===b?"1em":e,e=f.pixelLeft+"px",f.left=c,d&&(a.runtimeStyle.left=d)),""===e?"auto":e}),n.each(["height","width"],function(a,b){n.cssHooks[b]={get:function(a,c,d){return c?0!==a.offsetWidth||"none"!==Fb(a,"display")?$b(a,b,d):n.swap(a,Qb,function(){return $b(a,b,d)}):void 0},set:function(a,c,d){return Yb(a,c,d?Zb(a,b,d,n.support.boxSizing&&"border-box"===n.css(a,"boxSizing")):0)}}}),n.support.opacity||(n.cssHooks.opacity={get:function(a,b){return Jb.test((b&&a.currentStyle?a.currentStyle.filter:a.style.filter)||"")?.01*parseFloat(RegExp.$1)+"":b?"1":""},set:function(a,b){var c=a.style,d=a.currentStyle,e=n.isNumeric(b)?"alpha(opacity="+100*b+")":"",f=d&&d.filter||c.filter||"";c.zoom=1,b>=1&&""===n.trim(f.replace(Ib,""))&&c.removeAttribute&&(c.removeAttribute("filter"),d&&!d.filter)||(c.filter=Ib.test(f)?f.replace(Ib,e):f+" "+e)}}),n(function(){n.support.reliableMarginRight||(n.cssHooks.marginRight={get:function(a,b){return n.swap(a,{display:"inline-block"},function(){return b?Fb(a,"marginRight"):void 0})}}),!n.support.pixelPosition&&n.fn.position&&n.each(["top","left"],function(a,b){n.cssHooks[b]={get:function(a,c){if(c){var d=Fb(a,b);return Nb.test(d)?n(a).position()[b]+"px":d}}}})}),n.expr&&n.expr.filters&&(n.expr.filters.hidden=function(a){return 0===a.offsetWidth&&0===a.offsetHeight||!n.support.reliableHiddenOffsets&&"none"===(a.style&&a.style.display||Fb(a,"display"))},n.expr.filters.visible=function(a){return!n.expr.filters.hidden(a)}),n.each({margin:"",padding:"",border:"Width"},function(a,b){n.cssHooks[a+b]={expand:function(c){var d,e="string"==typeof c?c.split(" "):[c],f={};for(d=0;4>d;d++)f[a+Sb[d]+b]=e[d]||e[d-2]||e[0];return f}},Lb.test(a)||(n.cssHooks[a+b].set=Yb)});var ac=/%20/g,bc=/\[\]$/,cc=/\r?\n/g,dc=/^(?:color|date|datetime|datetime-local|email|hidden|month|number|password|range|search|tel|text|time|url|week)$/i,ec=/^(?:select|textarea)/i;n.fn.extend({serialize:function(){return n.param(this.serializeArray())},serializeArray:function(){return this.map(function(){return this.elements?n.makeArray(this.elements):this}).filter(function(){return this.name&&!this.disabled&&(this.checked||ec.test(this.nodeName)||dc.test(this.type))}).map(function(a,b){var c=n(this).val();return null==c?null:n.isArray(c)?n.map(c,function(a){return{name:b.name,value:a.replace(cc,"\r\n")}}):{name:b.name,value:c.replace(cc,"\r\n")}}).get()}}),n.param=function(a,c){var d,e=[],f=function(a,b){b=n.isFunction(b)?b():null==b?"":b,e[e.length]=encodeURIComponent(a)+"="+encodeURIComponent(b)};if(c===b&&(c=n.ajaxSettings&&n.ajaxSettings.traditional),n.isArray(a)||a.jquery&&!n.isPlainObject(a))n.each(a,function(){f(this.name,this.value)});else for(d in a)fc(d,a[d],c,f);return e.join("&").replace(ac,"+")};var gc,hc,ic=/#.*$/,jc=/^(.*?):[ \t]*([^\r\n]*)\r?$/gm,kc=/^(?:about|app|app\-storage|.+\-extension|file|res|widget):$/,lc=/^(?:GET|HEAD)$/,mc=/^\/\//,nc=/\?/,oc=/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,pc=/([?&])_=[^&]*/,qc=/^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+)|)|)/,rc=n.fn.load,sc={},tc={},uc=["*/"]+["*"];try{gc=f.href}catch(vc){gc=e.createElement("a"),gc.href="",gc=gc.href}hc=qc.exec(gc.toLowerCase())||[],n.fn.load=function(a,c,d){if("string"!=typeof a&&rc)return rc.apply(this,arguments);if(!this.length)return this;var e,f,g,h=this,i=a.indexOf(" ");return i>=0&&(e=a.slice(i,a.length),a=a.slice(0,i)),n.isFunction(c)?(d=c,c=b):"object"==typeof c&&(f="POST"),n.ajax({url:a,type:f,dataType:"html",data:c,complete:function(a,b){d&&h.each(d,g||[a.responseText,b,a])}}).done(function(a){g=arguments,h.html(e?n("<div>").append(a.replace(oc,"")).find(e):a)}),this},n.each("ajaxStart ajaxStop ajaxComplete ajaxError ajaxSuccess ajaxSend".split(" "),function(a,b){n.fn[b]=function(a){return this.on(b,a)}}),n.each(["get","post"],function(a,c){n[c]=function(a,d,e,f){return n.isFunction(d)&&(f=f||e,e=d,d=b),n.ajax({type:c,url:a,data:d,success:e,dataType:f})}}),n.extend({getScript:function(a,c){return n.get(a,b,c,"script")},getJSON:function(a,b,c){return n.get(a,b,c,"json")},ajaxSetup:function(a,b){return b?yc(a,n.ajaxSettings):(b=a,a=n.ajaxSettings),yc(a,b),a},ajaxSettings:{url:gc,isLocal:kc.test(hc[1]),global:!0,type:"GET",contentType:"application/x-www-form-urlencoded; charset=UTF-8",processData:!0,async:!0,accepts:{xml:"application/xml, text/xml",html:"text/html",text:"text/plain",json:"application/json, text/javascript","*":uc},contents:{xml:/xml/,html:/html/,json:/json/},responseFields:{xml:"responseXML",text:"responseText"},converters:{"* text":a.String,"text html":!0,"text json":n.parseJSON,"text xml":n.parseXML},flatOptions:{context:!0,url:!0}},ajaxPrefilter:wc(sc),ajaxTransport:wc(tc),ajax:function(a,c){function y(a,c,f,i){var k,q,t,u,w,y=c;2!==v&&(v=2,h&&clearTimeout(h),g=b,e=i||"",x.readyState=a>0?4:0,f&&(u=zc(l,x,f)),a>=200&&300>a||304===a?(l.ifModified&&(w=x.getResponseHeader("Last-Modified"),w&&(n.lastModified[d]=w),w=x.getResponseHeader("Etag"),w&&(n.etag[d]=w)),304===a?(y="notmodified",k=!0):(k=Ac(l,u),y=k.state,q=k.data,t=k.error,k=!t)):(t=y,(!y||a)&&(y="error",0>a&&(a=0))),x.status=a,x.statusText=""+(c||y),k?p.resolveWith(m,[q,y,x]):p.rejectWith(m,[x,y,t]),x.statusCode(s),s=b,j&&o.trigger("ajax"+(k?"Success":"Error"),[x,l,k?q:t]),r.fireWith(m,[x,y]),j&&(o.trigger("ajaxComplete",[x,l]),--n.active||n.event.trigger("ajaxStop")))}"object"==typeof a&&(c=a,a=b),c=c||{};var d,e,f,g,h,i,j,k,l=n.ajaxSetup({},c),m=l.context||l,o=m!==l&&(m.nodeType||m instanceof n)?n(m):n.event,p=n.Deferred(),r=n.Callbacks("once memory"),s=l.statusCode||{},t={},u={},v=0,w="canceled",x={readyState:0,setRequestHeader:function(a,b){if(!v){var c=a.toLowerCase();a=u[c]=u[c]||a,t[a]=b}return this},getAllResponseHeaders:function(){return 2===v?e:null},getResponseHeader:function(a){var c;if(2===v){if(!f)for(f={};c=jc.exec(e);)f[c[1].toLowerCase()]=c[2];c=f[a.toLowerCase()]}return c===b?null:c},overrideMimeType:function(a){return v||(l.mimeType=a),this},abort:function(a){return a=a||w,g&&g.abort(a),y(0,a),this}};if(p.promise(x),x.success=x.done,x.error=x.fail,x.complete=r.add,x.statusCode=function(a){if(a){var b;if(2>v)for(b in a)s[b]=[s[b],a[b]];else b=a[x.status],x.always(b)}return this},l.url=((a||l.url)+"").replace(ic,"").replace(mc,hc[1]+"//"),l.dataTypes=n.trim(l.dataType||"*").toLowerCase().split(q),null==l.crossDomain&&(i=qc.exec(l.url.toLowerCase()),l.crossDomain=!(!i||i[1]==hc[1]&&i[2]==hc[2]&&(i[3]||("http:"===i[1]?80:443))==(hc[3]||("http:"===hc[1]?80:443)))),l.data&&l.processData&&"string"!=typeof l.data&&(l.data=n.param(l.data,l.traditional)),xc(sc,l,c,x),2===v)return x;if(j=l.global,l.type=l.type.toUpperCase(),l.hasContent=!lc.test(l.type),j&&0===n.active++&&n.event.trigger("ajaxStart"),!l.hasContent&&(l.data&&(l.url+=(nc.test(l.url)?"&":"?")+l.data,delete l.data),d=l.url,l.cache===!1)){var z=n.now(),A=l.url.replace(pc,"$1_="+z);l.url=A+(A===l.url?(nc.test(l.url)?"&":"?")+"_="+z:"")}(l.data&&l.hasContent&&l.contentType!==!1||c.contentType)&&x.setRequestHeader("Content-Type",l.contentType),l.ifModified&&(d=d||l.url,n.lastModified[d]&&x.setRequestHeader("If-Modified-Since",n.lastModified[d]),n.etag[d]&&x.setRequestHeader("If-None-Match",n.etag[d])),x.setRequestHeader("Accept",l.dataTypes[0]&&l.accepts[l.dataTypes[0]]?l.accepts[l.dataTypes[0]]+("*"!==l.dataTypes[0]?", "+uc+"; q=0.01":""):l.accepts["*"]);for(k in l.headers)x.setRequestHeader(k,l.headers[k]);if(l.beforeSend&&(l.beforeSend.call(m,x,l)===!1||2===v))return x.abort();w="abort";for(k in{success:1,error:1,complete:1})x[k](l[k]);if(g=xc(tc,l,c,x)){x.readyState=1,j&&o.trigger("ajaxSend",[x,l]),l.async&&l.timeout>0&&(h=setTimeout(function(){x.abort("timeout")},l.timeout));try{v=1,g.send(t,y)}catch(B){if(!(2>v))throw B;y(-1,B)}}else y(-1,"No Transport");return x},active:0,lastModified:{},etag:{}});var Bc=[],Cc=/\?/,Dc=/(=)\?(?=&|$)|\?\?/,Ec=n.now();n.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var a=Bc.pop()||n.expando+"_"+Ec++;return this[a]=!0,a}}),n.ajaxPrefilter("json jsonp",function(c,d,e){var f,g,h,i=c.data,j=c.url,k=c.jsonp!==!1,l=k&&Dc.test(j),m=k&&!l&&"string"==typeof i&&!(c.contentType||"").indexOf("application/x-www-form-urlencoded")&&Dc.test(i);return"jsonp"===c.dataTypes[0]||l||m?(f=c.jsonpCallback=n.isFunction(c.jsonpCallback)?c.jsonpCallback():c.jsonpCallback,g=a[f],l?c.url=j.replace(Dc,"$1"+f):m?c.data=i.replace(Dc,"$1"+f):k&&(c.url+=(Cc.test(j)?"&":"?")+c.jsonp+"="+f),c.converters["script json"]=function(){return h||n.error(f+" was not called"),h[0]},c.dataTypes[0]="json",a[f]=function(){h=arguments},e.always(function(){a[f]=g,c[f]&&(c.jsonpCallback=d.jsonpCallback,Bc.push(f)),h&&n.isFunction(g)&&g(h[0]),h=g=b}),"script"):void 0}),n.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/javascript|ecmascript/},converters:{"text script":function(a){return n.globalEval(a),a}}}),n.ajaxPrefilter("script",function(a){a.cache===b&&(a.cache=!1),a.crossDomain&&(a.type="GET",a.global=!1)}),n.ajaxTransport("script",function(a){if(a.crossDomain){var c,d=e.head||e.getElementsByTagName("head")[0]||e.documentElement;return{send:function(f,g){c=e.createElement("script"),c.async="async",a.scriptCharset&&(c.charset=a.scriptCharset),c.src=a.url,c.onload=c.onreadystatechange=function(a,e){(e||!c.readyState||/loaded|complete/.test(c.readyState))&&(c.onload=c.onreadystatechange=null,d&&c.parentNode&&d.removeChild(c),c=b,e||g(200,"success"))},d.insertBefore(c,d.firstChild)},abort:function(){c&&c.onload(0,1)}}}});var Fc,Gc=a.ActiveXObject?function(){for(var a in Fc)Fc[a](0,1)}:!1,Hc=0;n.ajaxSettings.xhr=a.ActiveXObject?function(){return!this.isLocal&&Ic()||Jc()}:Ic,function(a){n.extend(n.support,{ajax:!!a,cors:!!a&&"withCredentials"in a})}(n.ajaxSettings.xhr()),n.support.ajax&&n.ajaxTransport(function(c){if(!c.crossDomain||n.support.cors){var d;return{send:function(e,f){var g,h,i=c.xhr();if(c.username?i.open(c.type,c.url,c.async,c.username,c.password):i.open(c.type,c.url,c.async),c.xhrFields)for(h in c.xhrFields)i[h]=c.xhrFields[h];c.mimeType&&i.overrideMimeType&&i.overrideMimeType(c.mimeType),c.crossDomain||e["X-Requested-With"]||(e["X-Requested-With"]="XMLHttpRequest");try{for(h in e)i.setRequestHeader(h,e[h])}catch(j){}i.send(c.hasContent&&c.data||null),d=function(a,e){var h,j,k,l,m;try{if(d&&(e||4===i.readyState))if(d=b,g&&(i.onreadystatechange=n.noop,Gc&&delete Fc[g]),e)4!==i.readyState&&i.abort();else{h=i.status,k=i.getAllResponseHeaders(),l={},m=i.responseXML,m&&m.documentElement&&(l.xml=m);try{l.text=i.responseText}catch(a){}try{j=i.statusText}catch(o){j=""}h||!c.isLocal||c.crossDomain?1223===h&&(h=204):h=l.text?200:404}}catch(p){e||f(-1,p)}l&&f(h,j,l,k)},c.async?4===i.readyState?setTimeout(d,0):(g=++Hc,Gc&&(Fc||(Fc={},n(a).unload(Gc)),Fc[g]=d),i.onreadystatechange=d):d()},abort:function(){d&&d(0,1)}}}});var Kc,Lc,Mc=/^(?:toggle|show|hide)$/,Nc=new RegExp("^(?:([-+])=|)("+o+")([a-z%]*)$","i"),Oc=/queueHooks$/,Pc=[Vc],Qc={"*":[function(a,b){var c,d,e,f=this.createTween(a,b),g=Nc.exec(b),h=f.cur(),i=+h||0,j=1;if(g){if(c=+g[2],d=g[3]||(n.cssNumber[a]?"":"px"),"px"!==d&&i){i=n.css(f.elem,a,!0)||c||1;do e=j=j||".5",i/=j,n.style(f.elem,a,i+d),j=f.cur()/h;while(1!==j&&j!==e)}f.unit=d,f.start=i,f.end=g[1]?i+(g[1]+1)*c:c}return f}]};n.Animation=n.extend(Tc,{tweener:function(a,b){n.isFunction(a)?(b=a,a=["*"]):a=a.split(" ");for(var c,d=0,e=a.length;e>d;d++)c=a[d],Qc[c]=Qc[c]||[],Qc[c].unshift(b)},prefilter:function(a,b){b?Pc.unshift(a):Pc.push(a)}}),n.Tween=Wc,Wc.prototype={constructor:Wc,init:function(a,b,c,d,e,f){this.elem=a,this.prop=c,this.easing=e||"swing",this.options=b,this.start=this.now=this.cur(),this.end=d,this.unit=f||(n.cssNumber[c]?"":"px")},cur:function(){var a=Wc.propHooks[this.prop];return a&&a.get?a.get(this):Wc.propHooks._default.get(this)},run:function(a){var b,c=Wc.propHooks[this.prop];return this.pos=b=n.easing[this.easing](a,this.options.duration*a,0,1,this.options.duration),this.now=(this.end-this.start)*b+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),c&&c.set?c.set(this):Wc.propHooks._default.set(this),this}},Wc.prototype.init.prototype=Wc.prototype,Wc.propHooks={_default:{get:function(a){var b;return null==a.elem[a.prop]||a.elem.style&&null!=a.elem.style[a.prop]?(b=n.css(a.elem,a.prop,!1,""),b&&"auto"!==b?b:0):a.elem[a.prop]},set:function(a){n.fx.step[a.prop]?n.fx.step[a.prop](a):a.elem.style&&(null!=a.elem.style[n.cssProps[a.prop]]||n.cssHooks[a.prop])?n.style(a.elem,a.prop,a.now+a.unit):a.elem[a.prop]=a.now}}},Wc.propHooks.scrollTop=Wc.propHooks.scrollLeft={set:function(a){a.elem.nodeType&&a.elem.parentNode&&(a.elem[a.prop]=a.now)}},n.each(["toggle","show","hide"],function(a,b){var c=n.fn[b];n.fn[b]=function(d,e,f){return null==d||"boolean"==typeof d||!a&&n.isFunction(d)&&n.isFunction(e)?c.apply(this,arguments):this.animate(Xc(b,!0),d,e,f)}}),n.fn.extend({fadeTo:function(a,b,c,d){return this.filter(Wb).css("opacity",0).show().end().animate({opacity:b},a,c,d)},animate:function(a,b,c,d){var e=n.isEmptyObject(a),f=n.speed(b,c,d),g=function(){var b=Tc(this,n.extend({},a),f);e&&b.stop(!0)};return e||f.queue===!1?this.each(g):this.queue(f.queue,g)},stop:function(a,c,d){var e=function(a){var b=a.stop;delete a.stop,b(d)};return"string"!=typeof a&&(d=c,c=a,a=b),c&&a!==!1&&this.queue(a||"fx",[]),this.each(function(){var b=!0,c=null!=a&&a+"queueHooks",f=n.timers,g=n._data(this);if(c)g[c]&&g[c].stop&&e(g[c]);else for(c in g)g[c]&&g[c].stop&&Oc.test(c)&&e(g[c]);for(c=f.length;c--;)f[c].elem!==this||null!=a&&f[c].queue!==a||(f[c].anim.stop(d),b=!1,f.splice(c,1));(b||!d)&&n.dequeue(this,a)})}}),n.each({slideDown:Xc("show"),slideUp:Xc("hide"),slideToggle:Xc("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(a,b){n.fn[a]=function(a,c,d){return this.animate(b,a,c,d)}}),n.speed=function(a,b,c){var d=a&&"object"==typeof a?n.extend({},a):{complete:c||!c&&b||n.isFunction(a)&&a,duration:a,easing:c&&b||b&&!n.isFunction(b)&&b};return d.duration=n.fx.off?0:"number"==typeof d.duration?d.duration:d.duration in n.fx.speeds?n.fx.speeds[d.duration]:n.fx.speeds._default,(null==d.queue||d.queue===!0)&&(d.queue="fx"),d.old=d.complete,d.complete=function(){n.isFunction(d.old)&&d.old.call(this),d.queue&&n.dequeue(this,d.queue)},d},n.easing={linear:function(a){return a},swing:function(a){return.5-Math.cos(a*Math.PI)/2}},n.timers=[],n.fx=Wc.prototype.init,n.fx.tick=function(){for(var a,b=n.timers,c=0;c<b.length;c++)a=b[c],a()||b[c]!==a||b.splice(c--,1);b.length||n.fx.stop()},n.fx.timer=function(a){a()&&n.timers.push(a)&&!Lc&&(Lc=setInterval(n.fx.tick,n.fx.interval))},n.fx.interval=13,n.fx.stop=function(){clearInterval(Lc),Lc=null},n.fx.speeds={slow:600,fast:200,_default:400},n.fx.step={},n.expr&&n.expr.filters&&(n.expr.filters.animated=function(a){return n.grep(n.timers,function(b){return a===b.elem}).length});var Yc=/^(?:body|html)$/i;return n.fn.offset=function(a){if(arguments.length)return a===b?this:this.each(function(b){n.offset.setOffset(this,a,b)});var c,d,e,f,g,h,i,j,k,l,m=this[0],o=m&&m.ownerDocument;if(o)return(e=o.body)===m?n.offset.bodyOffset(m):(d=o.documentElement,n.contains(d,m)?(c=m.getBoundingClientRect(),f=Zc(o),g=d.clientTop||e.clientTop||0,h=d.clientLeft||e.clientLeft||0,i=f.pageYOffset||d.scrollTop,j=f.pageXOffset||d.scrollLeft,k=c.top+i-g,l=c.left+j-h,{top:k,left:l}):{top:0,left:0})},n.offset={bodyOffset:function(a){var b=a.offsetTop,c=a.offsetLeft;return n.support.doesNotIncludeMarginInBodyOffset&&(b+=parseFloat(n.css(a,"marginTop"))||0,c+=parseFloat(n.css(a,"marginLeft"))||0),{top:b,left:c}},setOffset:function(a,b,c){var d=n.css(a,"position");"static"===d&&(a.style.position="relative");var l,m,e=n(a),f=e.offset(),g=n.css(a,"top"),h=n.css(a,"left"),i=("absolute"===d||"fixed"===d)&&n.inArray("auto",[g,h])>-1,j={},k={};i?(k=e.position(),l=k.top,m=k.left):(l=parseFloat(g)||0,m=parseFloat(h)||0),n.isFunction(b)&&(b=b.call(a,c,f)),null!=b.top&&(j.top=b.top-f.top+l),null!=b.left&&(j.left=b.left-f.left+m),"using"in b?b.using.call(a,j):e.css(j)}},n.fn.extend({position:function(){if(this[0]){var a=this[0],b=this.offsetParent(),c=this.offset(),d=Yc.test(b[0].nodeName)?{top:0,left:0}:b.offset();return c.top-=parseFloat(n.css(a,"marginTop"))||0,c.left-=parseFloat(n.css(a,"marginLeft"))||0,d.top+=parseFloat(n.css(b[0],"borderTopWidth"))||0,d.left+=parseFloat(n.css(b[0],"borderLeftWidth"))||0,{top:c.top-d.top,left:c.left-d.left}}},offsetParent:function(){return this.map(function(){for(var a=this.offsetParent||e.body;a&&!Yc.test(a.nodeName)&&"static"===n.css(a,"position");)a=a.offsetParent;return a||e.body})}}),n.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(a,c){var d=/Y/.test(c);n.fn[a]=function(e){return n.access(this,function(a,e,f){var g=Zc(a);return f===b?g?c in g?g[c]:g.document.documentElement[e]:a[e]:(g?g.scrollTo(d?n(g).scrollLeft():f,d?f:n(g).scrollTop()):a[e]=f,void 0)},a,e,arguments.length,null)}}),n.each({Height:"height",Width:"width"},function(a,c){n.each({padding:"inner"+a,content:c,"":"outer"+a},function(d,e){n.fn[e]=function(e,f){var g=arguments.length&&(d||"boolean"!=typeof e),h=d||(e===!0||f===!0?"margin":"border");return n.access(this,function(c,d,e){var f;return n.isWindow(c)?c.document.documentElement["client"+a]:9===c.nodeType?(f=c.documentElement,Math.max(c.body["scroll"+a],f["scroll"+a],c.body["offset"+a],f["offset"+a],f["client"+a])):e===b?n.css(c,d,e,h):n.style(c,d,e,h)},c,g?e:b,g)}})}),n}(_target || window);
			
			_log("Local jQuery version: ", $.fn.jquery);

			var _avatarPNG, _avatarJSON, _avatarCanvas, _avatarEl;

			var _options = {
				//-- Default options ----
				scale  : "1.0",//float, MUST be less than 2.34
				userid : null,
				avatar : null,//packet.avatars[0].layers (array)
				avatarBaseClass : "kartkingdom-player-avatar",
				//avatarLayers : null,
				//avatarPNG    : null,
				//avatarJSON   : null,
				animationData     : {"walk_90":[[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.5,"ty":182.7}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.2,"ty":155.05}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.15,"ty":156.05}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.15,"ty":156.05}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.15,"ty":156.05}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.2,"ty":155.05}},{"n":"chassis_90","t":{"a":-0.99,"b":0,"c":0,"d":1.01,"tx":180.3,"ty":253.25}},{"n":"decal_90","t":{"a":-1.19,"b":0,"c":0,"d":1.21,"tx":205.2,"ty":256.35}},{"n":"wheel_back_90","t":{"a":1.06,"b":0.22,"c":-0.22,"d":1.06,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.06,"b":0.22,"c":-0.22,"d":1.06,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.5,"ty":179.65}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.2,"ty":152}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":152.95}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":152.95}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":152.95}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.2,"ty":152}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":1.02,"tx":180.5,"ty":251.4}},{"n":"decal_90","t":{"a":-1.17,"b":0,"c":0,"d":1.23,"tx":205.45,"ty":254.2}},{"n":"wheel_back_90","t":{"a":0.99,"b":0.44,"c":-0.44,"d":0.99,"tx":141,"ty":263.35}},{"n":"wheel_front_90","t":{"a":0.99,"b":0.44,"c":-0.44,"d":0.99,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.4,"ty":176.7}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":149.05}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":149.05}},{"n":"chassis_90","t":{"a":-0.96,"b":0,"c":0,"d":1.04,"tx":180.65,"ty":249.6}},{"n":"decal_90","t":{"a":-1.16,"b":0,"c":0,"d":1.24,"tx":205.7,"ty":252.05}},{"n":"wheel_back_90","t":{"a":0.87,"b":0.63,"c":-0.63,"d":0.87,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.87,"b":0.63,"c":-0.63,"d":0.87,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.45,"ty":173.75}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":146}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":147}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":147}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":147}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":146}},{"n":"chassis_90","t":{"a":-0.95,"b":0,"c":0,"d":1.05,"tx":180.85,"ty":247.75}},{"n":"decal_90","t":{"a":-1.14,"b":0,"c":0,"d":1.26,"tx":205.85,"ty":249.85}},{"n":"wheel_back_90","t":{"a":0.72,"b":0.8,"c":-0.8,"d":0.72,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.72,"b":0.8,"c":-0.8,"d":0.72,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.45,"ty":170.75}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.05,"ty":142.95}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":143.95}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":143.95}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":143.95}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.05,"ty":142.95}},{"n":"chassis_90","t":{"a":-0.94,"b":0,"c":0,"d":1.06,"tx":181.05,"ty":245.95}},{"n":"decal_90","t":{"a":-1.13,"b":0,"c":0,"d":1.27,"tx":206.15,"ty":247.65}},{"n":"wheel_back_90","t":{"a":0.54,"b":0.93,"c":-0.93,"d":0.54,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.54,"b":0.93,"c":-0.93,"d":0.54,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.45,"ty":173.75}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175,"ty":145.9}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":146.95}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":146.95}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":146.95}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175,"ty":145.9}},{"n":"chassis_90","t":{"a":-0.95,"b":0,"c":0,"d":1.05,"tx":180.9,"ty":247.75}},{"n":"decal_90","t":{"a":-1.14,"b":0,"c":0,"d":1.26,"tx":205.9,"ty":249.85}},{"n":"wheel_back_90","t":{"a":0.33,"b":1.03,"c":-1.03,"d":0.33,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.33,"b":1.03,"c":-1.03,"d":0.33,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.4,"ty":176.75}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":148.95}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":148.95}},{"n":"chassis_90","t":{"a":-0.96,"b":0,"c":0,"d":1.04,"tx":180.65,"ty":249.6}},{"n":"decal_90","t":{"a":-1.16,"b":0,"c":0,"d":1.24,"tx":205.7,"ty":251.95}},{"n":"wheel_back_90","t":{"a":0.11,"b":1.07,"c":-1.07,"d":0.11,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.11,"b":1.07,"c":-1.07,"d":0.11,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.5,"ty":179.75}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.15,"ty":152}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":153.05}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":153.05}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":153.05}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.15,"ty":152}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":1.02,"tx":180.5,"ty":251.4}},{"n":"decal_90","t":{"a":-1.17,"b":0,"c":0,"d":1.23,"tx":205.45,"ty":254.2}},{"n":"wheel_back_90","t":{"a":-0.11,"b":1.07,"c":-1.07,"d":-0.11,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":-0.11,"b":1.07,"c":-1.07,"d":-0.11,"tx":300.55,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.5,"ty":182.7}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.15,"ty":155}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":156.1}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":156.1}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":156.1}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.15,"ty":155}},{"n":"chassis_90","t":{"a":-0.99,"b":0,"c":0,"d":1.01,"tx":180.35,"ty":253.25}},{"n":"decal_90","t":{"a":-1.19,"b":0,"c":0,"d":1.21,"tx":205.3,"ty":256.35}},{"n":"wheel_back_90","t":{"a":-0.33,"b":1.03,"c":-1.03,"d":-0.33,"tx":140.95,"ty":263.3}},{"n":"wheel_front_90","t":{"a":-0.33,"b":1.03,"c":-1.03,"d":-0.33,"tx":300.55,"ty":263.25}}],[{"n":"top_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":180.5,"ty":185.7}},{"n":"hair_back_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":175.15,"ty":158.05}},{"n":"head_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":176.15,"ty":159.05}},{"n":"eyes_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":176.15,"ty":159.05}},{"n":"mouth_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":176.15,"ty":159.05}},{"n":"hair_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":175.15,"ty":158.05}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":-0.54,"b":0.94,"c":-0.94,"d":-0.54,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":-0.54,"b":0.94,"c":-0.94,"d":-0.54,"tx":300.55,"ty":263.25}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.5,"ty":182.7}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.2,"ty":155.05}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.15,"ty":156.05}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.15,"ty":156.05}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.15,"ty":156.05}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.2,"ty":155.05}},{"n":"chassis_90","t":{"a":-0.99,"b":0,"c":0,"d":1.01,"tx":180.3,"ty":253.25}},{"n":"decal_90","t":{"a":-1.19,"b":0,"c":0,"d":1.21,"tx":205.2,"ty":256.35}},{"n":"wheel_back_90","t":{"a":-0.72,"b":0.8,"c":-0.8,"d":-0.72,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":-0.72,"b":0.8,"c":-0.8,"d":-0.72,"tx":300.55,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.5,"ty":179.65}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.2,"ty":152}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":152.95}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":152.95}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":152.95}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.2,"ty":152}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":1.02,"tx":180.5,"ty":251.4}},{"n":"decal_90","t":{"a":-1.17,"b":0,"c":0,"d":1.23,"tx":205.45,"ty":254.2}},{"n":"wheel_back_90","t":{"a":-0.87,"b":0.63,"c":-0.63,"d":-0.87,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":-0.87,"b":0.63,"c":-0.63,"d":-0.87,"tx":300.55,"ty":263.25}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.4,"ty":176.7}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":149.05}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":149.05}},{"n":"chassis_90","t":{"a":-0.96,"b":0,"c":0,"d":1.04,"tx":180.65,"ty":249.6}},{"n":"decal_90","t":{"a":-1.16,"b":0,"c":0,"d":1.24,"tx":205.7,"ty":252.05}},{"n":"wheel_back_90","t":{"a":-0.98,"b":0.44,"c":-0.44,"d":-0.98,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":-0.99,"b":0.44,"c":-0.44,"d":-0.99,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.45,"ty":173.75}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":146}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":147}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":147}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":147}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":146}},{"n":"chassis_90","t":{"a":-0.95,"b":0,"c":0,"d":1.05,"tx":180.85,"ty":247.75}},{"n":"decal_90","t":{"a":-1.14,"b":0,"c":0,"d":1.26,"tx":205.85,"ty":249.85}},{"n":"wheel_back_90","t":{"a":-1.06,"b":0.22,"c":-0.22,"d":-1.06,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":-1.06,"b":0.22,"c":-0.22,"d":-1.06,"tx":300.6,"ty":263.25}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.45,"ty":170.75}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.05,"ty":142.95}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":143.95}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":143.95}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":143.95}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.05,"ty":142.95}},{"n":"chassis_90","t":{"a":-0.94,"b":0,"c":0,"d":1.06,"tx":181.05,"ty":245.95}},{"n":"decal_90","t":{"a":-1.13,"b":0,"c":0,"d":1.27,"tx":206.15,"ty":247.65}},{"n":"wheel_back_90","t":{"a":-1.08,"b":0,"c":0,"d":-1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":-1.08,"b":0,"c":0,"d":-1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.45,"ty":173.75}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175,"ty":145.9}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":146.95}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":146.95}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":146.95}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175,"ty":145.9}},{"n":"chassis_90","t":{"a":-0.95,"b":0,"c":0,"d":1.05,"tx":180.9,"ty":247.75}},{"n":"decal_90","t":{"a":-1.14,"b":0,"c":0,"d":1.26,"tx":205.9,"ty":249.85}},{"n":"wheel_back_90","t":{"a":-1.06,"b":-0.22,"c":0.22,"d":-1.06,"tx":140.95,"ty":263.3}},{"n":"wheel_front_90","t":{"a":-1.06,"b":-0.22,"c":0.22,"d":-1.06,"tx":300.6,"ty":263.4}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.4,"ty":176.75}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":148.95}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":148.95}},{"n":"chassis_90","t":{"a":-0.96,"b":0,"c":0,"d":1.04,"tx":180.65,"ty":249.6}},{"n":"decal_90","t":{"a":-1.16,"b":0,"c":0,"d":1.24,"tx":205.7,"ty":251.95}},{"n":"wheel_back_90","t":{"a":-0.99,"b":-0.44,"c":0.44,"d":-0.99,"tx":140.95,"ty":263.35}},{"n":"wheel_front_90","t":{"a":-0.99,"b":-0.44,"c":0.44,"d":-0.99,"tx":300.55,"ty":263.4}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.5,"ty":179.75}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.15,"ty":152}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":153.05}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":153.05}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":153.05}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.15,"ty":152}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":1.02,"tx":180.5,"ty":251.4}},{"n":"decal_90","t":{"a":-1.17,"b":0,"c":0,"d":1.23,"tx":205.45,"ty":254.2}},{"n":"wheel_back_90","t":{"a":-0.87,"b":-0.63,"c":0.63,"d":-0.87,"tx":140.95,"ty":263.3}},{"n":"wheel_front_90","t":{"a":-0.87,"b":-0.63,"c":0.63,"d":-0.87,"tx":300.55,"ty":263.35}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.5,"ty":182.7}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.15,"ty":155}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":156.1}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":156.1}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":156.1}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.15,"ty":155}},{"n":"chassis_90","t":{"a":-0.99,"b":0,"c":0,"d":1.01,"tx":180.35,"ty":253.25}},{"n":"decal_90","t":{"a":-1.19,"b":0,"c":0,"d":1.21,"tx":205.3,"ty":256.35}},{"n":"wheel_back_90","t":{"a":-0.73,"b":-0.8,"c":0.8,"d":-0.73,"tx":140.95,"ty":263.3}},{"n":"wheel_front_90","t":{"a":-0.73,"b":-0.8,"c":0.8,"d":-0.73,"tx":300.6,"ty":263.35}}],[{"n":"top_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":180.5,"ty":185.7}},{"n":"hair_back_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":175.15,"ty":158.05}},{"n":"head_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":176.15,"ty":159.05}},{"n":"eyes_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":176.15,"ty":159.05}},{"n":"mouth_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":176.15,"ty":159.05}},{"n":"hair_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":175.15,"ty":158.05}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":-0.54,"b":-0.93,"c":0.93,"d":-0.54,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":-0.54,"b":-0.93,"c":0.93,"d":-0.54,"tx":300.55,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.5,"ty":182.7}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.2,"ty":155.05}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.15,"ty":156.05}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.15,"ty":156.05}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.15,"ty":156.05}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.2,"ty":155.05}},{"n":"chassis_90","t":{"a":-0.99,"b":0,"c":0,"d":1.01,"tx":180.3,"ty":253.25}},{"n":"decal_90","t":{"a":-1.19,"b":0,"c":0,"d":1.21,"tx":205.2,"ty":256.35}},{"n":"wheel_back_90","t":{"a":-0.34,"b":-1.02,"c":1.02,"d":-0.34,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":-0.34,"b":-1.02,"c":1.02,"d":-0.34,"tx":300.5,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.5,"ty":179.65}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.2,"ty":152}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":152.95}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":152.95}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":152.95}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.2,"ty":152}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":1.02,"tx":180.5,"ty":251.4}},{"n":"decal_90","t":{"a":-1.17,"b":0,"c":0,"d":1.23,"tx":205.45,"ty":254.2}},{"n":"wheel_back_90","t":{"a":-0.12,"b":-1.07,"c":1.07,"d":-0.12,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":-0.12,"b":-1.07,"c":1.07,"d":-0.12,"tx":300.55,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.4,"ty":176.7}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":149.05}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":149.05}},{"n":"chassis_90","t":{"a":-0.96,"b":0,"c":0,"d":1.04,"tx":180.65,"ty":249.6}},{"n":"decal_90","t":{"a":-1.16,"b":0,"c":0,"d":1.24,"tx":205.7,"ty":252.05}},{"n":"wheel_back_90","t":{"a":0.1,"b":-1.07,"c":1.07,"d":0.1,"tx":140.95,"ty":263.2}},{"n":"wheel_front_90","t":{"a":0.1,"b":-1.07,"c":1.07,"d":0.1,"tx":300.5,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.45,"ty":173.75}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":146}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":147}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":147}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":147}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":146}},{"n":"chassis_90","t":{"a":-0.95,"b":0,"c":0,"d":1.05,"tx":180.85,"ty":247.75}},{"n":"decal_90","t":{"a":-1.14,"b":0,"c":0,"d":1.26,"tx":205.85,"ty":249.85}},{"n":"wheel_back_90","t":{"a":0.32,"b":-1.03,"c":1.03,"d":0.32,"tx":141,"ty":263.2}},{"n":"wheel_front_90","t":{"a":0.32,"b":-1.03,"c":1.03,"d":0.32,"tx":300.5,"ty":263.2}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.45,"ty":170.75}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.05,"ty":142.95}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":143.95}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":143.95}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":143.95}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.05,"ty":142.95}},{"n":"chassis_90","t":{"a":-0.94,"b":0,"c":0,"d":1.06,"tx":181.05,"ty":245.95}},{"n":"decal_90","t":{"a":-1.13,"b":0,"c":0,"d":1.27,"tx":206.15,"ty":247.65}},{"n":"wheel_back_90","t":{"a":0.53,"b":-0.94,"c":0.94,"d":0.53,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.53,"b":-0.94,"c":0.94,"d":0.53,"tx":300.5,"ty":263.25}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.45,"ty":173.75}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175,"ty":145.9}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":146.95}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":146.95}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176,"ty":146.95}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175,"ty":145.9}},{"n":"chassis_90","t":{"a":-0.95,"b":0,"c":0,"d":1.05,"tx":180.9,"ty":247.75}},{"n":"decal_90","t":{"a":-1.14,"b":0,"c":0,"d":1.26,"tx":205.9,"ty":249.85}},{"n":"wheel_back_90","t":{"a":0.71,"b":-0.81,"c":0.81,"d":0.71,"tx":141,"ty":263.2}},{"n":"wheel_front_90","t":{"a":0.71,"b":-0.81,"c":0.81,"d":0.71,"tx":300.55,"ty":263.25}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.4,"ty":176.75}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":148.95}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.05,"ty":150}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.1,"ty":148.95}},{"n":"chassis_90","t":{"a":-0.96,"b":0,"c":0,"d":1.04,"tx":180.65,"ty":249.6}},{"n":"decal_90","t":{"a":-1.16,"b":0,"c":0,"d":1.24,"tx":205.7,"ty":251.95}},{"n":"wheel_back_90","t":{"a":0.86,"b":-0.65,"c":0.65,"d":0.86,"tx":141.05,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.86,"b":-0.65,"c":0.65,"d":0.86,"tx":300.55,"ty":263.25}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.5,"ty":179.75}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.15,"ty":152}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":153.05}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":153.05}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":153.05}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.15,"ty":152}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":1.02,"tx":180.5,"ty":251.4}},{"n":"decal_90","t":{"a":-1.17,"b":0,"c":0,"d":1.23,"tx":205.45,"ty":254.2}},{"n":"wheel_back_90","t":{"a":0.98,"b":-0.45,"c":0.45,"d":0.98,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.98,"b":-0.45,"c":0.45,"d":0.98,"tx":300.55,"ty":263.25}}],[{"n":"top_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":180.5,"ty":182.7}},{"n":"hair_back_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.15,"ty":155}},{"n":"head_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":156.1}},{"n":"eyes_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":156.1}},{"n":"mouth_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":176.1,"ty":156.1}},{"n":"hair_90","t":{"a":-0.97,"b":0.22,"c":0.22,"d":0.97,"tx":175.15,"ty":155}},{"n":"chassis_90","t":{"a":-0.99,"b":0,"c":0,"d":1.01,"tx":180.35,"ty":253.25}},{"n":"decal_90","t":{"a":-1.19,"b":0,"c":0,"d":1.21,"tx":205.3,"ty":256.35}},{"n":"wheel_back_90","t":{"a":1.05,"b":-0.24,"c":0.24,"d":1.05,"tx":141.05,"ty":263.25}},{"n":"wheel_front_90","t":{"a":1.05,"b":-0.24,"c":0.24,"d":1.05,"tx":300.55,"ty":263.15}}],[{"n":"top_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":180.5,"ty":185.7}},{"n":"hair_back_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":175.15,"ty":158.05}},{"n":"head_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":176.15,"ty":159.05}},{"n":"eyes_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":176.15,"ty":159.05}},{"n":"mouth_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":176.15,"ty":159.05}},{"n":"hair_90","t":{"a":-0.98,"b":0.22,"c":0.22,"d":0.98,"tx":175.15,"ty":158.05}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":-0.02,"c":0.02,"d":1.08,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":1.08,"b":-0.02,"c":0.02,"d":1.08,"tx":300.55,"ty":263.25}}]],"hop_back_90":[[{"n":"top_90","t":{"a":-0.98,"b":0.18,"c":0.18,"d":0.98,"tx":166.55,"ty":182.9}},{"n":"hair_back_90","t":{"a":-0.98,"b":0.18,"c":0.18,"d":0.98,"tx":162.8,"ty":157.3}},{"n":"head_90","t":{"a":-0.98,"b":0.18,"c":0.18,"d":0.98,"tx":163.9,"ty":158.05}},{"n":"eyes_90","t":{"a":-0.98,"b":0.18,"c":0.18,"d":0.98,"tx":163.9,"ty":158.05}},{"n":"mouth_90","t":{"a":-0.98,"b":0.18,"c":0.18,"d":0.98,"tx":163.9,"ty":158.05}},{"n":"hair_90","t":{"a":-0.98,"b":0.18,"c":0.18,"d":0.98,"tx":162.8,"ty":157.3}},{"n":"chassis_90","t":{"a":-0.99,"b":0.14,"c":0.14,"d":0.99,"tx":176.95,"ty":248.45}},{"n":"decal_90","t":{"a":-1.19,"b":0.16,"c":0.16,"d":1.19,"tx":201,"ty":248.75}},{"n":"wheel_back_90","t":{"a":1.07,"b":-0.15,"c":0.15,"d":1.07,"tx":140.95,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":-0.08,"c":0.08,"d":1.08,"tx":298.45,"ty":240.95}}],[{"n":"top_90","t":{"a":-0.94,"b":0.34,"c":0.34,"d":0.94,"tx":155.75,"ty":180.4}},{"n":"hair_back_90","t":{"a":-0.94,"b":0.34,"c":0.34,"d":0.94,"tx":148.15,"ty":157}},{"n":"head_90","t":{"a":-0.94,"b":0.34,"c":0.34,"d":0.94,"tx":149.3,"ty":157.55}},{"n":"eyes_90","t":{"a":-0.94,"b":0.34,"c":0.34,"d":0.94,"tx":149.3,"ty":157.55}},{"n":"mouth_90","t":{"a":-0.94,"b":0.34,"c":0.34,"d":0.94,"tx":149.3,"ty":157.55}},{"n":"hair_90","t":{"a":-0.94,"b":0.34,"c":0.34,"d":0.94,"tx":148.15,"ty":157}},{"n":"chassis_90","t":{"a":-0.97,"b":0.26,"c":0.26,"d":0.97,"tx":174.05,"ty":242.5}},{"n":"decal_90","t":{"a":-1.16,"b":0.31,"c":0.31,"d":1.16,"tx":197.35,"ty":239.8}},{"n":"wheel_back_90","t":{"a":1.04,"b":-0.28,"c":0.28,"d":1.04,"tx":140.95,"ty":263.35}},{"n":"wheel_front_90","t":{"a":1.07,"b":-0.15,"c":0.15,"d":1.07,"tx":296.3,"ty":218.5}}],[{"n":"top_90","t":{"a":-0.88,"b":0.48,"c":0.48,"d":0.88,"tx":146.15,"ty":178.2}},{"n":"hair_back_90","t":{"a":-0.88,"b":0.48,"c":0.48,"d":0.88,"tx":135.05,"ty":156.75}},{"n":"head_90","t":{"a":-0.88,"b":0.48,"c":0.48,"d":0.88,"tx":136.25,"ty":157.05}},{"n":"eyes_90","t":{"a":-0.88,"b":0.48,"c":0.48,"d":0.88,"tx":136.25,"ty":157.05}},{"n":"mouth_90","t":{"a":-0.88,"b":0.48,"c":0.48,"d":0.88,"tx":136.25,"ty":157.05}},{"n":"hair_90","t":{"a":-0.88,"b":0.48,"c":0.48,"d":0.88,"tx":135.05,"ty":156.75}},{"n":"chassis_90","t":{"a":-0.93,"b":0.36,"c":0.36,"d":0.93,"tx":171.5,"ty":237.2}},{"n":"decal_90","t":{"a":-1.12,"b":0.43,"c":0.43,"d":1.12,"tx":194.05,"ty":231.9}},{"n":"wheel_back_90","t":{"a":1.01,"b":-0.39,"c":0.39,"d":1.01,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.05,"b":-0.22,"c":0.22,"d":1.05,"tx":289.85,"ty":201.4}}],[{"n":"top_90","t":{"a":-0.81,"b":0.59,"c":0.59,"d":0.81,"tx":137.65,"ty":176.2}},{"n":"hair_back_90","t":{"a":-0.81,"b":0.59,"c":0.59,"d":0.81,"tx":123.45,"ty":156.5}},{"n":"head_90","t":{"a":-0.81,"b":0.59,"c":0.59,"d":0.81,"tx":124.7,"ty":156.65}},{"n":"eyes_90","t":{"a":-0.81,"b":0.59,"c":0.59,"d":0.81,"tx":124.7,"ty":156.65}},{"n":"mouth_90","t":{"a":-0.81,"b":0.59,"c":0.59,"d":0.81,"tx":124.7,"ty":156.65}},{"n":"hair_90","t":{"a":-0.81,"b":0.59,"c":0.59,"d":0.81,"tx":123.45,"ty":156.5}},{"n":"chassis_90","t":{"a":-0.89,"b":0.45,"c":0.45,"d":0.89,"tx":169.25,"ty":232.5}},{"n":"decal_90","t":{"a":-1.07,"b":0.54,"c":0.54,"d":1.07,"tx":191.25,"ty":224.9}},{"n":"wheel_back_90","t":{"a":0.96,"b":-0.49,"c":0.49,"d":0.96,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.04,"b":-0.3,"c":0.3,"d":1.04,"tx":283.35,"ty":184.25}}],[{"n":"top_90","t":{"a":-0.73,"b":0.68,"c":0.68,"d":0.73,"tx":130.25,"ty":174.5}},{"n":"hair_back_90","t":{"a":-0.73,"b":0.68,"c":0.68,"d":0.73,"tx":113.4,"ty":156.3}},{"n":"head_90","t":{"a":-0.73,"b":0.68,"c":0.68,"d":0.73,"tx":114.75,"ty":156.3}},{"n":"eyes_90","t":{"a":-0.73,"b":0.68,"c":0.68,"d":0.73,"tx":114.75,"ty":156.3}},{"n":"mouth_90","t":{"a":-0.73,"b":0.68,"c":0.68,"d":0.73,"tx":114.75,"ty":156.3}},{"n":"hair_90","t":{"a":-0.73,"b":0.68,"c":0.68,"d":0.73,"tx":113.4,"ty":156.3}},{"n":"chassis_90","t":{"a":-0.85,"b":0.52,"c":0.52,"d":0.85,"tx":167.3,"ty":228.5}},{"n":"decal_90","t":{"a":-1.02,"b":0.63,"c":0.63,"d":1.02,"tx":188.75,"ty":218.8}},{"n":"wheel_back_90","t":{"a":0.92,"b":-0.56,"c":0.56,"d":0.92,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.01,"b":-0.37,"c":0.37,"d":1.01,"tx":276.9,"ty":171.65}}],[{"n":"top_90","t":{"a":-0.67,"b":0.74,"c":0.74,"d":0.67,"tx":124,"ty":173.05}},{"n":"hair_back_90","t":{"a":-0.67,"b":0.74,"c":0.74,"d":0.67,"tx":104.95,"ty":156.15}},{"n":"head_90","t":{"a":-0.67,"b":0.74,"c":0.74,"d":0.67,"tx":106.3,"ty":156}},{"n":"eyes_90","t":{"a":-0.67,"b":0.74,"c":0.74,"d":0.67,"tx":106.3,"ty":156}},{"n":"mouth_90","t":{"a":-0.67,"b":0.74,"c":0.74,"d":0.67,"tx":106.3,"ty":156}},{"n":"hair_90","t":{"a":-0.67,"b":0.74,"c":0.74,"d":0.67,"tx":104.95,"ty":156.15}},{"n":"chassis_90","t":{"a":-0.81,"b":0.58,"c":0.58,"d":0.81,"tx":165.6,"ty":225}},{"n":"decal_90","t":{"a":-0.97,"b":0.7,"c":0.7,"d":0.97,"tx":186.6,"ty":213.7}},{"n":"wheel_back_90","t":{"a":0.88,"b":-0.63,"c":0.63,"d":0.88,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.98,"b":-0.44,"c":0.44,"d":0.98,"tx":270.7,"ty":162.3}}],[{"n":"top_90","t":{"a":-0.6,"b":0.8,"c":0.8,"d":0.6,"tx":118.9,"ty":171.9}},{"n":"hair_back_90","t":{"a":-0.6,"b":0.8,"c":0.8,"d":0.6,"tx":98,"ty":156}},{"n":"head_90","t":{"a":-0.6,"b":0.8,"c":0.8,"d":0.6,"tx":99.4,"ty":155.75}},{"n":"eyes_90","t":{"a":-0.6,"b":0.8,"c":0.8,"d":0.6,"tx":99.4,"ty":155.75}},{"n":"mouth_90","t":{"a":-0.6,"b":0.8,"c":0.8,"d":0.6,"tx":99.4,"ty":155.75}},{"n":"hair_90","t":{"a":-0.6,"b":0.8,"c":0.8,"d":0.6,"tx":98,"ty":156}},{"n":"chassis_90","t":{"a":-0.77,"b":0.63,"c":0.63,"d":0.77,"tx":164.25,"ty":222.15}},{"n":"decal_90","t":{"a":-0.93,"b":0.76,"c":0.76,"d":0.93,"tx":184.95,"ty":209.5}},{"n":"wheel_back_90","t":{"a":0.84,"b":-0.68,"c":0.68,"d":0.84,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.95,"b":-0.51,"c":0.51,"d":0.95,"tx":264.6,"ty":152.8}}],[{"n":"top_90","t":{"a":-0.55,"b":0.83,"c":0.83,"d":0.55,"tx":114.95,"ty":171}},{"n":"hair_back_90","t":{"a":-0.55,"b":0.83,"c":0.83,"d":0.55,"tx":92.6,"ty":155.9}},{"n":"head_90","t":{"a":-0.55,"b":0.83,"c":0.83,"d":0.55,"tx":94,"ty":155.55}},{"n":"eyes_90","t":{"a":-0.55,"b":0.83,"c":0.83,"d":0.55,"tx":94,"ty":155.55}},{"n":"mouth_90","t":{"a":-0.55,"b":0.83,"c":0.83,"d":0.55,"tx":94,"ty":155.55}},{"n":"hair_90","t":{"a":-0.55,"b":0.83,"c":0.83,"d":0.55,"tx":92.6,"ty":155.9}},{"n":"chassis_90","t":{"a":-0.75,"b":0.66,"c":0.66,"d":0.75,"tx":163.15,"ty":220}},{"n":"decal_90","t":{"a":-0.9,"b":0.8,"c":0.8,"d":0.9,"tx":183.6,"ty":206.2}},{"n":"wheel_back_90","t":{"a":0.81,"b":-0.72,"c":0.72,"d":0.81,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.91,"b":-0.58,"c":0.58,"d":0.91,"tx":259.9,"ty":146.3}}],[{"n":"top_90","t":{"a":-0.52,"b":0.85,"c":0.85,"d":0.52,"tx":112.1,"ty":170.3}},{"n":"hair_back_90","t":{"a":-0.52,"b":0.85,"c":0.85,"d":0.52,"tx":88.75,"ty":155.8}},{"n":"head_90","t":{"a":-0.52,"b":0.85,"c":0.85,"d":0.52,"tx":90.15,"ty":155.4}},{"n":"eyes_90","t":{"a":-0.52,"b":0.85,"c":0.85,"d":0.52,"tx":90.15,"ty":155.4}},{"n":"mouth_90","t":{"a":-0.52,"b":0.85,"c":0.85,"d":0.52,"tx":90.15,"ty":155.4}},{"n":"hair_90","t":{"a":-0.52,"b":0.85,"c":0.85,"d":0.52,"tx":88.75,"ty":155.8}},{"n":"chassis_90","t":{"a":-0.72,"b":0.69,"c":0.69,"d":0.72,"tx":162.4,"ty":218.4}},{"n":"decal_90","t":{"a":-0.87,"b":0.83,"c":0.83,"d":0.87,"tx":182.65,"ty":203.85}},{"n":"wheel_back_90","t":{"a":0.78,"b":-0.74,"c":0.74,"d":0.78,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.86,"b":-0.64,"c":0.64,"d":0.86,"tx":256.2,"ty":142.15}}],[{"n":"top_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":110.4,"ty":169.95}},{"n":"hair_back_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":86.4,"ty":155.75}},{"n":"head_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.85,"ty":155.35}},{"n":"eyes_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.85,"ty":155.35}},{"n":"mouth_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.85,"ty":155.35}},{"n":"hair_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":86.4,"ty":155.75}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":162,"ty":217.4}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.84,"d":0.85,"tx":182.1,"ty":202.45}},{"n":"wheel_back_90","t":{"a":0.77,"b":-0.76,"c":0.76,"d":0.77,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.81,"b":-0.7,"c":0.7,"d":0.81,"tx":254.5,"ty":139.4}}],[{"n":"top_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":109.85,"ty":169.8}},{"n":"hair_back_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":85.65,"ty":155.75}},{"n":"head_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":155.3}},{"n":"eyes_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":155.3}},{"n":"mouth_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":155.3}},{"n":"hair_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":85.65,"ty":155.75}},{"n":"chassis_90","t":{"a":-0.71,"b":0.71,"c":0.71,"d":0.71,"tx":161.85,"ty":217.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":202}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":137.8}}],[{"n":"top_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":109.9,"ty":173.3}},{"n":"hair_back_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":85.65,"ty":159.35}},{"n":"head_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":87.05,"ty":158.9}},{"n":"eyes_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":87.05,"ty":158.9}},{"n":"mouth_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":87.05,"ty":158.9}},{"n":"hair_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":85.65,"ty":159.35}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.8,"ty":220.2}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.85,"d":0.84,"tx":181.85,"ty":205.2}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.85,"ty":141.45}}],[{"n":"top_90","t":{"a":-0.48,"b":0.85,"c":0.87,"d":0.48,"tx":109.95,"ty":183.95}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.85,"c":0.87,"d":0.48,"tx":85.6,"ty":170.2}},{"n":"head_90","t":{"a":-0.48,"b":0.85,"c":0.87,"d":0.48,"tx":87.05,"ty":169.75}},{"n":"eyes_90","t":{"a":-0.48,"b":0.85,"c":0.87,"d":0.48,"tx":87.05,"ty":169.75}},{"n":"mouth_90","t":{"a":-0.48,"b":0.85,"c":0.87,"d":0.48,"tx":87.05,"ty":169.75}},{"n":"hair_90","t":{"a":-0.48,"b":0.85,"c":0.87,"d":0.48,"tx":85.6,"ty":170.2}},{"n":"chassis_90","t":{"a":-0.71,"b":0.69,"c":0.71,"d":0.69,"tx":161.85,"ty":229.6}},{"n":"decal_90","t":{"a":-0.85,"b":0.82,"c":0.85,"d":0.82,"tx":181.85,"ty":214.8}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.74,"c":0.76,"d":0.74,"tx":252.9,"ty":152.35}}],[{"n":"top_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":110.15,"ty":201.55}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":85.7,"ty":188.25}},{"n":"head_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":87.15,"ty":187.8}},{"n":"eyes_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":87.15,"ty":187.8}},{"n":"mouth_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":87.15,"ty":187.8}},{"n":"hair_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":85.7,"ty":188.25}},{"n":"chassis_90","t":{"a":-0.71,"b":0.66,"c":0.7,"d":0.66,"tx":161.85,"ty":245.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.79,"c":0.85,"d":0.8,"tx":181.85,"ty":230.9}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.71,"c":0.76,"d":0.72,"tx":252.9,"ty":170.7}}],[{"n":"top_90","t":{"a":-0.44,"b":0.86,"c":0.9,"d":0.42,"tx":110.05,"ty":187.8}},{"n":"hair_back_90","t":{"a":-0.44,"b":0.86,"c":0.9,"d":0.42,"tx":85.15,"ty":175.45}},{"n":"head_90","t":{"a":-0.44,"b":0.86,"c":0.9,"d":0.42,"tx":86.55,"ty":174.95}},{"n":"eyes_90","t":{"a":-0.44,"b":0.86,"c":0.9,"d":0.42,"tx":86.55,"ty":174.95}},{"n":"mouth_90","t":{"a":-0.44,"b":0.86,"c":0.9,"d":0.42,"tx":86.55,"ty":174.95}},{"n":"hair_90","t":{"a":-0.44,"b":0.86,"c":0.9,"d":0.42,"tx":85.15,"ty":175.45}},{"n":"chassis_90","t":{"a":-0.71,"b":0.68,"c":0.7,"d":0.68,"tx":161.8,"ty":232.6}},{"n":"decal_90","t":{"a":-0.85,"b":0.81,"c":0.85,"d":0.81,"tx":181.9,"ty":218}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":257.85}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.73,"c":0.76,"d":0.73,"tx":252.95,"ty":158.15}}],[{"n":"top_90","t":{"a":-0.4,"b":0.89,"c":0.91,"d":0.4,"tx":110.05,"ty":177.1}},{"n":"hair_back_90","t":{"a":-0.4,"b":0.89,"c":0.91,"d":0.4,"tx":84.7,"ty":165.5}},{"n":"head_90","t":{"a":-0.4,"b":0.89,"c":0.91,"d":0.4,"tx":86,"ty":165}},{"n":"eyes_90","t":{"a":-0.4,"b":0.89,"c":0.91,"d":0.4,"tx":86,"ty":165}},{"n":"mouth_90","t":{"a":-0.4,"b":0.89,"c":0.91,"d":0.4,"tx":86,"ty":165}},{"n":"hair_90","t":{"a":-0.4,"b":0.89,"c":0.91,"d":0.4,"tx":84.7,"ty":165.5}},{"n":"chassis_90","t":{"a":-0.71,"b":0.69,"c":0.71,"d":0.69,"tx":161.85,"ty":222.7}},{"n":"decal_90","t":{"a":-0.85,"b":0.83,"c":0.85,"d":0.83,"tx":181.95,"ty":207.9}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":253.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.75,"c":0.76,"d":0.75,"tx":252.85,"ty":148.35}}],[{"n":"top_90","t":{"a":-0.38,"b":0.91,"c":0.92,"d":0.38,"tx":110,"ty":169.45}},{"n":"hair_back_90","t":{"a":-0.38,"b":0.91,"c":0.92,"d":0.38,"tx":84.35,"ty":158.45}},{"n":"head_90","t":{"a":-0.38,"b":0.91,"c":0.92,"d":0.38,"tx":85.65,"ty":157.9}},{"n":"eyes_90","t":{"a":-0.38,"b":0.91,"c":0.92,"d":0.38,"tx":85.65,"ty":157.9}},{"n":"mouth_90","t":{"a":-0.38,"b":0.91,"c":0.92,"d":0.38,"tx":85.65,"ty":157.9}},{"n":"hair_90","t":{"a":-0.38,"b":0.91,"c":0.92,"d":0.38,"tx":84.35,"ty":158.45}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.8,"ty":215.75}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.85,"d":0.84,"tx":181.95,"ty":200.8}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":250.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.75,"c":0.76,"d":0.75,"tx":252.9,"ty":141.4}}],[{"n":"top_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.37,"tx":109.9,"ty":164.9}},{"n":"hair_back_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.37,"tx":84.15,"ty":154.15}},{"n":"head_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.37,"tx":85.45,"ty":153.6}},{"n":"eyes_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.37,"tx":85.45,"ty":153.6}},{"n":"mouth_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.37,"tx":85.45,"ty":153.6}},{"n":"hair_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.37,"tx":84.15,"ty":154.15}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.85,"ty":211.55}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.85,"d":0.84,"tx":181.9,"ty":196.45}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":248.85}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.85,"ty":137.2}}],[{"n":"top_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":110,"ty":163.35}},{"n":"hair_back_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.1,"ty":152.8}},{"n":"head_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.45,"ty":152.15}},{"n":"eyes_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.45,"ty":152.15}},{"n":"mouth_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.45,"ty":152.15}},{"n":"hair_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.1,"ty":152.8}},{"n":"chassis_90","t":{"a":-0.71,"b":0.71,"c":0.71,"d":0.71,"tx":161.85,"ty":210.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":195}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":248.3}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":135.8}}],[{"n":"top_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":110.05,"ty":163.9}},{"n":"hair_back_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.1,"ty":153.3}},{"n":"head_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.5,"ty":152.6}},{"n":"eyes_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.5,"ty":152.6}},{"n":"mouth_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.5,"ty":152.6}},{"n":"hair_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.1,"ty":153.3}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":210.7}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":195.6}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":248.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":136.25}}],[{"n":"top_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":110,"ty":165.55}},{"n":"hair_back_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":84.25,"ty":154.55}},{"n":"head_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":85.6,"ty":154}},{"n":"eyes_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":85.6,"ty":154}},{"n":"mouth_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":85.6,"ty":154}},{"n":"hair_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":84.25,"ty":154.55}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":212.35}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":197.25}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":249.9}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":137.5}}],[{"n":"top_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":110,"ty":168.2}},{"n":"hair_back_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":84.45,"ty":156.85}},{"n":"head_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":85.85,"ty":156.25}},{"n":"eyes_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":85.85,"ty":156.25}},{"n":"mouth_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":85.85,"ty":156.25}},{"n":"hair_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":84.45,"ty":156.85}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":215.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":200.05}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":252}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":139.6}}],[{"n":"top_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":110,"ty":172.1}},{"n":"hair_back_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":84.8,"ty":159.9}},{"n":"head_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":86.25,"ty":159.35}},{"n":"eyes_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":86.25,"ty":159.35}},{"n":"mouth_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":86.25,"ty":159.35}},{"n":"hair_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":84.8,"ty":159.9}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":219.05}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":203.95}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":254.9}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":142.5}}],[{"n":"top_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":109.95,"ty":176.85}},{"n":"hair_back_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":85.15,"ty":163.9}},{"n":"head_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":86.65,"ty":163.4}},{"n":"eyes_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":86.65,"ty":163.4}},{"n":"mouth_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":86.65,"ty":163.4}},{"n":"hair_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":85.15,"ty":163.9}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":224.05}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":208.95}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":258.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":146.25}}],[{"n":"top_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":109.85,"ty":182.8}},{"n":"hair_back_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":85.65,"ty":168.75}},{"n":"head_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":168.3}},{"n":"eyes_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":168.3}},{"n":"mouth_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":168.3}},{"n":"hair_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":85.65,"ty":168.75}},{"n":"chassis_90","t":{"a":-0.71,"b":0.71,"c":0.71,"d":0.71,"tx":161.85,"ty":230.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":215}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":150.8}}],[{"n":"top_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":109.85,"ty":187}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":85.6,"ty":173.1}},{"n":"head_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":87.05,"ty":172.65}},{"n":"eyes_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":87.05,"ty":172.65}},{"n":"mouth_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":87.05,"ty":172.65}},{"n":"hair_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":85.6,"ty":173.1}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.9,"ty":233.5}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.85,"d":0.84,"tx":181.85,"ty":218.5}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.75,"c":0.76,"d":0.75,"tx":252.9,"ty":155.15}}],[{"n":"top_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":109.95,"ty":193.2}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":85.65,"ty":179.6}},{"n":"head_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":87.15,"ty":179.15}},{"n":"eyes_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":87.15,"ty":179.15}},{"n":"mouth_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":87.15,"ty":179.15}},{"n":"hair_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":85.65,"ty":179.6}},{"n":"chassis_90","t":{"a":-0.71,"b":0.68,"c":0.7,"d":0.68,"tx":161.85,"ty":238.5}},{"n":"decal_90","t":{"a":-0.85,"b":0.82,"c":0.84,"d":0.82,"tx":181.85,"ty":223.85}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.73,"c":0.76,"d":0.74,"tx":252.85,"ty":161.8}}],[{"n":"top_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":110.15,"ty":201.55}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":85.7,"ty":188.25}},{"n":"head_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":87.15,"ty":187.8}},{"n":"eyes_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":87.15,"ty":187.8}},{"n":"mouth_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":87.15,"ty":187.8}},{"n":"hair_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":85.7,"ty":188.25}},{"n":"chassis_90","t":{"a":-0.71,"b":0.66,"c":0.7,"d":0.66,"tx":161.85,"ty":245.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.79,"c":0.85,"d":0.8,"tx":181.85,"ty":230.9}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.71,"c":0.76,"d":0.72,"tx":252.9,"ty":170.7}}],[{"n":"top_90","t":{"a":-0.44,"b":0.86,"c":0.9,"d":0.42,"tx":110.05,"ty":189.6}},{"n":"hair_back_90","t":{"a":-0.44,"b":0.86,"c":0.9,"d":0.42,"tx":85.15,"ty":177.25}},{"n":"head_90","t":{"a":-0.44,"b":0.86,"c":0.9,"d":0.42,"tx":86.55,"ty":176.75}},{"n":"eyes_90","t":{"a":-0.44,"b":0.86,"c":0.9,"d":0.42,"tx":86.55,"ty":176.75}},{"n":"mouth_90","t":{"a":-0.44,"b":0.86,"c":0.9,"d":0.42,"tx":86.55,"ty":176.75}},{"n":"hair_90","t":{"a":-0.44,"b":0.86,"c":0.9,"d":0.42,"tx":85.15,"ty":177.25}},{"n":"chassis_90","t":{"a":-0.71,"b":0.68,"c":0.7,"d":0.68,"tx":161.8,"ty":234.4}},{"n":"decal_90","t":{"a":-0.85,"b":0.81,"c":0.85,"d":0.81,"tx":181.9,"ty":219.8}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":257.85}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.73,"c":0.76,"d":0.73,"tx":252.95,"ty":158.15}}],[{"n":"top_90","t":{"a":-0.4,"b":0.89,"c":0.91,"d":0.4,"tx":110.05,"ty":180.3}},{"n":"hair_back_90","t":{"a":-0.4,"b":0.89,"c":0.91,"d":0.4,"tx":84.7,"ty":168.7}},{"n":"head_90","t":{"a":-0.4,"b":0.89,"c":0.91,"d":0.4,"tx":86,"ty":168.2}},{"n":"eyes_90","t":{"a":-0.4,"b":0.89,"c":0.91,"d":0.4,"tx":86,"ty":168.2}},{"n":"mouth_90","t":{"a":-0.4,"b":0.89,"c":0.91,"d":0.4,"tx":86,"ty":168.2}},{"n":"hair_90","t":{"a":-0.4,"b":0.89,"c":0.91,"d":0.4,"tx":84.7,"ty":168.7}},{"n":"chassis_90","t":{"a":-0.71,"b":0.69,"c":0.71,"d":0.69,"tx":161.85,"ty":225.9}},{"n":"decal_90","t":{"a":-0.85,"b":0.83,"c":0.85,"d":0.83,"tx":181.95,"ty":211.1}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":253.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.75,"c":0.76,"d":0.75,"tx":252.85,"ty":148.35}}],[{"n":"top_90","t":{"a":-0.38,"b":0.91,"c":0.92,"d":0.38,"tx":110,"ty":173.65}},{"n":"hair_back_90","t":{"a":-0.38,"b":0.91,"c":0.92,"d":0.38,"tx":84.35,"ty":162.65}},{"n":"head_90","t":{"a":-0.38,"b":0.91,"c":0.92,"d":0.38,"tx":85.65,"ty":162.1}},{"n":"eyes_90","t":{"a":-0.38,"b":0.91,"c":0.92,"d":0.38,"tx":85.65,"ty":162.1}},{"n":"mouth_90","t":{"a":-0.38,"b":0.91,"c":0.92,"d":0.38,"tx":85.65,"ty":162.1}},{"n":"hair_90","t":{"a":-0.38,"b":0.91,"c":0.92,"d":0.38,"tx":84.35,"ty":162.65}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.8,"ty":219.95}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.85,"d":0.84,"tx":181.95,"ty":205}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":250.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.75,"c":0.76,"d":0.75,"tx":252.9,"ty":141.4}}],[{"n":"top_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.37,"tx":109.9,"ty":169.7}},{"n":"hair_back_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.37,"tx":84.15,"ty":158.95}},{"n":"head_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.37,"tx":85.45,"ty":158.4}},{"n":"eyes_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.37,"tx":85.45,"ty":158.4}},{"n":"mouth_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.37,"tx":85.45,"ty":158.4}},{"n":"hair_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.37,"tx":84.15,"ty":158.95}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.85,"ty":216.35}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.85,"d":0.84,"tx":181.9,"ty":201.25}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":248.85}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.85,"ty":137.2}}],[{"n":"top_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":110,"ty":168.35}},{"n":"hair_back_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.1,"ty":157.8}},{"n":"head_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.45,"ty":157.15}},{"n":"eyes_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.45,"ty":157.15}},{"n":"mouth_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.45,"ty":157.15}},{"n":"hair_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.1,"ty":157.8}},{"n":"chassis_90","t":{"a":-0.71,"b":0.71,"c":0.71,"d":0.71,"tx":161.85,"ty":215.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":200}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":248.3}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":135.8}}],[{"n":"top_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":110,"ty":168.75}},{"n":"hair_back_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.15,"ty":158.1}},{"n":"head_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.5,"ty":157.45}},{"n":"eyes_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.5,"ty":157.45}},{"n":"mouth_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.5,"ty":157.45}},{"n":"hair_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.15,"ty":158.1}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":215.55}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":200.4}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":248.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":136.25}}],[{"n":"top_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":110,"ty":170}},{"n":"hair_back_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":84.25,"ty":159.05}},{"n":"head_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":85.65,"ty":158.45}},{"n":"eyes_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":85.65,"ty":158.45}},{"n":"mouth_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":85.65,"ty":158.45}},{"n":"hair_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":84.25,"ty":159.05}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":216.8}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":201.65}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":249.9}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":137.5}}],[{"n":"top_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":109.95,"ty":171.95}},{"n":"hair_back_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":84.45,"ty":160.6}},{"n":"head_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":85.85,"ty":160}},{"n":"eyes_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":85.85,"ty":160}},{"n":"mouth_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":85.85,"ty":160}},{"n":"hair_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":84.45,"ty":160.6}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":218.9}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":203.75}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":252}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":139.6}}],[{"n":"top_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":109.95,"ty":174.75}},{"n":"hair_back_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":84.8,"ty":162.65}},{"n":"head_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":86.2,"ty":162.1}},{"n":"eyes_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":86.2,"ty":162.1}},{"n":"mouth_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":86.2,"ty":162.1}},{"n":"hair_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":84.8,"ty":162.65}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":221.8}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":206.65}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":254.9}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":142.5}}],[{"n":"top_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":109.85,"ty":178.4}},{"n":"hair_back_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":85.15,"ty":165.4}},{"n":"head_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":86.65,"ty":164.95}},{"n":"eyes_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":86.65,"ty":164.95}},{"n":"mouth_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":86.65,"ty":164.95}},{"n":"hair_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":85.15,"ty":165.4}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":225.55}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":210.4}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":258.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":146.25}}],[{"n":"top_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":109.85,"ty":182.8}},{"n":"hair_back_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":85.65,"ty":168.75}},{"n":"head_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":168.3}},{"n":"eyes_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":168.3}},{"n":"mouth_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":168.3}},{"n":"hair_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":85.65,"ty":168.75}},{"n":"chassis_90","t":{"a":-0.71,"b":0.71,"c":0.71,"d":0.71,"tx":161.85,"ty":230.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":215}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":150.8}}],[{"n":"top_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":109.85,"ty":187}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":85.6,"ty":173.1}},{"n":"head_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":87.05,"ty":172.65}},{"n":"eyes_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":87.05,"ty":172.65}},{"n":"mouth_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":87.05,"ty":172.65}},{"n":"hair_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":85.6,"ty":173.1}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.9,"ty":233.5}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.85,"d":0.84,"tx":181.85,"ty":218.5}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.75,"c":0.76,"d":0.75,"tx":252.9,"ty":155.15}}],[{"n":"top_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":109.95,"ty":193.2}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":85.65,"ty":179.6}},{"n":"head_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":87.15,"ty":179.15}},{"n":"eyes_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":87.15,"ty":179.15}},{"n":"mouth_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":87.15,"ty":179.15}},{"n":"hair_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":85.65,"ty":179.6}},{"n":"chassis_90","t":{"a":-0.71,"b":0.68,"c":0.7,"d":0.68,"tx":161.85,"ty":238.5}},{"n":"decal_90","t":{"a":-0.85,"b":0.82,"c":0.84,"d":0.82,"tx":181.85,"ty":223.85}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.73,"c":0.76,"d":0.74,"tx":252.85,"ty":161.8}}],[{"n":"top_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":110.15,"ty":201.55}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":85.7,"ty":188.25}},{"n":"head_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":87.15,"ty":187.8}},{"n":"eyes_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":87.15,"ty":187.8}},{"n":"mouth_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":87.15,"ty":187.8}},{"n":"hair_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":85.7,"ty":188.25}},{"n":"chassis_90","t":{"a":-0.71,"b":0.66,"c":0.7,"d":0.66,"tx":161.85,"ty":245.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.79,"c":0.85,"d":0.8,"tx":181.85,"ty":230.9}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.71,"c":0.76,"d":0.72,"tx":252.9,"ty":170.7}}],[{"n":"top_90","t":{"a":-0.44,"b":0.85,"c":0.89,"d":0.43,"tx":110.1,"ty":191.4}},{"n":"hair_back_90","t":{"a":-0.44,"b":0.85,"c":0.89,"d":0.43,"tx":85.25,"ty":178.9}},{"n":"head_90","t":{"a":-0.44,"b":0.85,"c":0.89,"d":0.43,"tx":86.6,"ty":178.45}},{"n":"eyes_90","t":{"a":-0.44,"b":0.85,"c":0.89,"d":0.43,"tx":86.6,"ty":178.45}},{"n":"mouth_90","t":{"a":-0.44,"b":0.85,"c":0.89,"d":0.43,"tx":86.6,"ty":178.45}},{"n":"hair_90","t":{"a":-0.44,"b":0.85,"c":0.89,"d":0.43,"tx":85.25,"ty":178.9}},{"n":"chassis_90","t":{"a":-0.71,"b":0.67,"c":0.7,"d":0.68,"tx":161.85,"ty":236}},{"n":"decal_90","t":{"a":-0.85,"b":0.81,"c":0.84,"d":0.81,"tx":181.95,"ty":221.45}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":258.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.73,"c":0.76,"d":0.73,"tx":252.85,"ty":160.1}}],[{"n":"top_90","t":{"a":-0.42,"b":0.88,"c":0.91,"d":0.41,"tx":110.05,"ty":183.1}},{"n":"hair_back_90","t":{"a":-0.42,"b":0.88,"c":0.91,"d":0.41,"tx":84.8,"ty":171.35}},{"n":"head_90","t":{"a":-0.42,"b":0.88,"c":0.91,"d":0.41,"tx":86.15,"ty":170.75}},{"n":"eyes_90","t":{"a":-0.42,"b":0.88,"c":0.91,"d":0.41,"tx":86.15,"ty":170.75}},{"n":"mouth_90","t":{"a":-0.42,"b":0.88,"c":0.91,"d":0.41,"tx":86.15,"ty":170.75}},{"n":"hair_90","t":{"a":-0.42,"b":0.88,"c":0.91,"d":0.41,"tx":84.8,"ty":171.35}},{"n":"chassis_90","t":{"a":-0.71,"b":0.69,"c":0.71,"d":0.69,"tx":161.8,"ty":228.5}},{"n":"decal_90","t":{"a":-0.85,"b":0.82,"c":0.85,"d":0.82,"tx":181.95,"ty":213.75}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":254.9}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.74,"c":0.76,"d":0.74,"tx":252.9,"ty":151.35}}],[{"n":"top_90","t":{"a":-0.39,"b":0.9,"c":0.92,"d":0.39,"tx":110,"ty":176.65}},{"n":"hair_back_90","t":{"a":-0.39,"b":0.9,"c":0.92,"d":0.39,"tx":84.55,"ty":165.35}},{"n":"head_90","t":{"a":-0.39,"b":0.9,"c":0.92,"d":0.39,"tx":85.9,"ty":164.8}},{"n":"eyes_90","t":{"a":-0.39,"b":0.9,"c":0.92,"d":0.39,"tx":85.9,"ty":164.8}},{"n":"mouth_90","t":{"a":-0.39,"b":0.9,"c":0.92,"d":0.39,"tx":85.9,"ty":164.8}},{"n":"hair_90","t":{"a":-0.39,"b":0.9,"c":0.92,"d":0.39,"tx":84.55,"ty":165.35}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.85,"ty":222.65}},{"n":"decal_90","t":{"a":-0.85,"b":0.83,"c":0.85,"d":0.83,"tx":181.95,"ty":207.7}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":252}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.75,"c":0.76,"d":0.75,"tx":252.85,"ty":144.6}}],[{"n":"top_90","t":{"a":-0.38,"b":0.92,"c":0.93,"d":0.37,"tx":110.05,"ty":172.05}},{"n":"hair_back_90","t":{"a":-0.38,"b":0.92,"c":0.93,"d":0.37,"tx":84.3,"ty":161.15}},{"n":"head_90","t":{"a":-0.38,"b":0.92,"c":0.93,"d":0.37,"tx":85.6,"ty":160.55}},{"n":"eyes_90","t":{"a":-0.38,"b":0.92,"c":0.93,"d":0.37,"tx":85.6,"ty":160.55}},{"n":"mouth_90","t":{"a":-0.38,"b":0.92,"c":0.93,"d":0.37,"tx":85.6,"ty":160.55}},{"n":"hair_90","t":{"a":-0.38,"b":0.92,"c":0.93,"d":0.37,"tx":84.3,"ty":161.15}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.8,"ty":218.45}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.85,"d":0.84,"tx":181.95,"ty":203.4}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":249.9}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":139.7}}],[{"n":"top_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.36,"tx":110,"ty":169.25}},{"n":"hair_back_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.36,"tx":84.15,"ty":158.65}},{"n":"head_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.36,"tx":85.4,"ty":158.05}},{"n":"eyes_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.36,"tx":85.4,"ty":158.05}},{"n":"mouth_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.36,"tx":85.4,"ty":158.05}},{"n":"hair_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.36,"tx":84.15,"ty":158.65}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.8,"ty":216.05}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.85,"d":0.84,"tx":181.95,"ty":200.9}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":248.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":136.75}}],[{"n":"top_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":110,"ty":168.35}},{"n":"hair_back_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.1,"ty":157.8}},{"n":"head_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.45,"ty":157.15}},{"n":"eyes_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.45,"ty":157.15}},{"n":"mouth_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.45,"ty":157.15}},{"n":"hair_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.1,"ty":157.8}},{"n":"chassis_90","t":{"a":-0.71,"b":0.71,"c":0.71,"d":0.71,"tx":161.85,"ty":215.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":200}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":248.3}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":135.8}}],[{"n":"top_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":110,"ty":168.75}},{"n":"hair_back_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.15,"ty":158.1}},{"n":"head_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.5,"ty":157.45}},{"n":"eyes_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.5,"ty":157.45}},{"n":"mouth_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.5,"ty":157.45}},{"n":"hair_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.15,"ty":158.1}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":215.55}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":200.4}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":248.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":136.25}}],[{"n":"top_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":110,"ty":170}},{"n":"hair_back_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":84.25,"ty":159.05}},{"n":"head_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":85.65,"ty":158.45}},{"n":"eyes_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":85.65,"ty":158.45}},{"n":"mouth_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":85.65,"ty":158.45}},{"n":"hair_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":84.25,"ty":159.05}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":216.8}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":201.65}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":249.9}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":137.5}}],[{"n":"top_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":109.95,"ty":171.95}},{"n":"hair_back_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":84.45,"ty":160.6}},{"n":"head_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":85.85,"ty":160}},{"n":"eyes_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":85.85,"ty":160}},{"n":"mouth_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":85.85,"ty":160}},{"n":"hair_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":84.45,"ty":160.6}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":218.9}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":203.75}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":252}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":139.6}}],[{"n":"top_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":109.95,"ty":174.75}},{"n":"hair_back_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":84.8,"ty":162.65}},{"n":"head_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":86.2,"ty":162.1}},{"n":"eyes_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":86.2,"ty":162.1}},{"n":"mouth_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":86.2,"ty":162.1}},{"n":"hair_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":84.8,"ty":162.65}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":221.8}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":206.65}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":254.9}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":142.5}}],[{"n":"top_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":109.85,"ty":178.4}},{"n":"hair_back_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":85.15,"ty":165.4}},{"n":"head_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":86.65,"ty":164.95}},{"n":"eyes_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":86.65,"ty":164.95}},{"n":"mouth_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":86.65,"ty":164.95}},{"n":"hair_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":85.15,"ty":165.4}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":225.55}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":210.4}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":258.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":146.25}}],[{"n":"top_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":109.85,"ty":182.8}},{"n":"hair_back_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":85.65,"ty":168.75}},{"n":"head_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":168.3}},{"n":"eyes_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":168.3}},{"n":"mouth_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":168.3}},{"n":"hair_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":85.65,"ty":168.75}},{"n":"chassis_90","t":{"a":-0.71,"b":0.71,"c":0.71,"d":0.71,"tx":161.85,"ty":230.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":215}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":150.8}}],[{"n":"top_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":109.85,"ty":187}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":85.6,"ty":173.1}},{"n":"head_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":87.05,"ty":172.65}},{"n":"eyes_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":87.05,"ty":172.65}},{"n":"mouth_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":87.05,"ty":172.65}},{"n":"hair_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":85.6,"ty":173.1}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.9,"ty":233.5}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.85,"d":0.84,"tx":181.85,"ty":218.5}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.75,"c":0.76,"d":0.75,"tx":252.9,"ty":155.15}}],[{"n":"top_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":109.95,"ty":193.2}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":85.65,"ty":179.6}},{"n":"head_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":87.15,"ty":179.15}},{"n":"eyes_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":87.15,"ty":179.15}},{"n":"mouth_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":87.15,"ty":179.15}},{"n":"hair_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":85.65,"ty":179.6}},{"n":"chassis_90","t":{"a":-0.71,"b":0.68,"c":0.7,"d":0.68,"tx":161.85,"ty":238.5}},{"n":"decal_90","t":{"a":-0.85,"b":0.82,"c":0.84,"d":0.82,"tx":181.85,"ty":223.85}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.73,"c":0.76,"d":0.74,"tx":252.85,"ty":161.8}}],[{"n":"top_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":110.15,"ty":201.55}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":85.7,"ty":188.25}},{"n":"head_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":87.15,"ty":187.8}},{"n":"eyes_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":87.15,"ty":187.8}},{"n":"mouth_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":87.15,"ty":187.8}},{"n":"hair_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":85.7,"ty":188.25}},{"n":"chassis_90","t":{"a":-0.71,"b":0.66,"c":0.7,"d":0.66,"tx":161.85,"ty":245.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.79,"c":0.85,"d":0.8,"tx":181.85,"ty":230.9}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.71,"c":0.76,"d":0.72,"tx":252.9,"ty":170.7}}],[{"n":"top_90","t":{"a":-0.44,"b":0.85,"c":0.89,"d":0.43,"tx":110.1,"ty":191.4}},{"n":"hair_back_90","t":{"a":-0.44,"b":0.85,"c":0.89,"d":0.43,"tx":85.25,"ty":178.9}},{"n":"head_90","t":{"a":-0.44,"b":0.85,"c":0.89,"d":0.43,"tx":86.6,"ty":178.45}},{"n":"eyes_90","t":{"a":-0.44,"b":0.85,"c":0.89,"d":0.43,"tx":86.6,"ty":178.45}},{"n":"mouth_90","t":{"a":-0.44,"b":0.85,"c":0.89,"d":0.43,"tx":86.6,"ty":178.45}},{"n":"hair_90","t":{"a":-0.44,"b":0.85,"c":0.89,"d":0.43,"tx":85.25,"ty":178.9}},{"n":"chassis_90","t":{"a":-0.71,"b":0.67,"c":0.7,"d":0.68,"tx":161.85,"ty":236}},{"n":"decal_90","t":{"a":-0.85,"b":0.81,"c":0.84,"d":0.81,"tx":181.95,"ty":221.45}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":258.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.73,"c":0.76,"d":0.73,"tx":252.85,"ty":160.1}}],[{"n":"top_90","t":{"a":-0.42,"b":0.88,"c":0.91,"d":0.41,"tx":110.05,"ty":183.1}},{"n":"hair_back_90","t":{"a":-0.42,"b":0.88,"c":0.91,"d":0.41,"tx":84.8,"ty":171.35}},{"n":"head_90","t":{"a":-0.42,"b":0.88,"c":0.91,"d":0.41,"tx":86.15,"ty":170.75}},{"n":"eyes_90","t":{"a":-0.42,"b":0.88,"c":0.91,"d":0.41,"tx":86.15,"ty":170.75}},{"n":"mouth_90","t":{"a":-0.42,"b":0.88,"c":0.91,"d":0.41,"tx":86.15,"ty":170.75}},{"n":"hair_90","t":{"a":-0.42,"b":0.88,"c":0.91,"d":0.41,"tx":84.8,"ty":171.35}},{"n":"chassis_90","t":{"a":-0.71,"b":0.69,"c":0.71,"d":0.69,"tx":161.8,"ty":228.5}},{"n":"decal_90","t":{"a":-0.85,"b":0.82,"c":0.85,"d":0.82,"tx":181.95,"ty":213.75}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":254.9}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.74,"c":0.76,"d":0.74,"tx":252.9,"ty":151.35}}],[{"n":"top_90","t":{"a":-0.39,"b":0.9,"c":0.92,"d":0.39,"tx":110,"ty":176.65}},{"n":"hair_back_90","t":{"a":-0.39,"b":0.9,"c":0.92,"d":0.39,"tx":84.55,"ty":165.35}},{"n":"head_90","t":{"a":-0.39,"b":0.9,"c":0.92,"d":0.39,"tx":85.9,"ty":164.8}},{"n":"eyes_90","t":{"a":-0.39,"b":0.9,"c":0.92,"d":0.39,"tx":85.9,"ty":164.8}},{"n":"mouth_90","t":{"a":-0.39,"b":0.9,"c":0.92,"d":0.39,"tx":85.9,"ty":164.8}},{"n":"hair_90","t":{"a":-0.39,"b":0.9,"c":0.92,"d":0.39,"tx":84.55,"ty":165.35}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.85,"ty":222.65}},{"n":"decal_90","t":{"a":-0.85,"b":0.83,"c":0.85,"d":0.83,"tx":181.95,"ty":207.7}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":252}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.75,"c":0.76,"d":0.75,"tx":252.85,"ty":144.6}}],[{"n":"top_90","t":{"a":-0.38,"b":0.92,"c":0.93,"d":0.37,"tx":110.05,"ty":172.05}},{"n":"hair_back_90","t":{"a":-0.38,"b":0.92,"c":0.93,"d":0.37,"tx":84.3,"ty":161.15}},{"n":"head_90","t":{"a":-0.38,"b":0.92,"c":0.93,"d":0.37,"tx":85.6,"ty":160.55}},{"n":"eyes_90","t":{"a":-0.38,"b":0.92,"c":0.93,"d":0.37,"tx":85.6,"ty":160.55}},{"n":"mouth_90","t":{"a":-0.38,"b":0.92,"c":0.93,"d":0.37,"tx":85.6,"ty":160.55}},{"n":"hair_90","t":{"a":-0.38,"b":0.92,"c":0.93,"d":0.37,"tx":84.3,"ty":161.15}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.8,"ty":218.45}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.85,"d":0.84,"tx":181.95,"ty":203.4}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":249.9}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":139.7}}],[{"n":"top_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.36,"tx":110,"ty":169.25}},{"n":"hair_back_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.36,"tx":84.15,"ty":158.65}},{"n":"head_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.36,"tx":85.4,"ty":158.05}},{"n":"eyes_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.36,"tx":85.4,"ty":158.05}},{"n":"mouth_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.36,"tx":85.4,"ty":158.05}},{"n":"hair_90","t":{"a":-0.37,"b":0.93,"c":0.93,"d":0.36,"tx":84.15,"ty":158.65}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.8,"ty":216.05}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.85,"d":0.84,"tx":181.95,"ty":200.9}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":248.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":136.75}}],[{"n":"top_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":110,"ty":168.35}},{"n":"hair_back_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.1,"ty":157.8}},{"n":"head_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.45,"ty":157.15}},{"n":"eyes_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.45,"ty":157.15}},{"n":"mouth_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.45,"ty":157.15}},{"n":"hair_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.1,"ty":157.8}},{"n":"chassis_90","t":{"a":-0.71,"b":0.71,"c":0.71,"d":0.71,"tx":161.85,"ty":215.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":200}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":248.3}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":135.8}}],[{"n":"top_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":110,"ty":168.75}},{"n":"hair_back_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.15,"ty":158.1}},{"n":"head_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.5,"ty":157.45}},{"n":"eyes_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.5,"ty":157.45}},{"n":"mouth_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":85.5,"ty":157.45}},{"n":"hair_90","t":{"a":-0.36,"b":0.93,"c":0.93,"d":0.36,"tx":84.15,"ty":158.1}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":215.55}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":200.4}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":248.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":136.25}}],[{"n":"top_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":110,"ty":170}},{"n":"hair_back_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":84.25,"ty":159.05}},{"n":"head_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":85.65,"ty":158.45}},{"n":"eyes_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":85.65,"ty":158.45}},{"n":"mouth_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":85.65,"ty":158.45}},{"n":"hair_90","t":{"a":-0.38,"b":0.93,"c":0.93,"d":0.38,"tx":84.25,"ty":159.05}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":216.8}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":201.65}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":249.9}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":137.5}}],[{"n":"top_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":109.95,"ty":171.95}},{"n":"hair_back_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":84.45,"ty":160.6}},{"n":"head_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":85.85,"ty":160}},{"n":"eyes_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":85.85,"ty":160}},{"n":"mouth_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":85.85,"ty":160}},{"n":"hair_90","t":{"a":-0.39,"b":0.92,"c":0.92,"d":0.39,"tx":84.45,"ty":160.6}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":218.9}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":203.75}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":252}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":139.6}}],[{"n":"top_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":109.95,"ty":174.75}},{"n":"hair_back_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":84.8,"ty":162.65}},{"n":"head_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":86.2,"ty":162.1}},{"n":"eyes_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":86.2,"ty":162.1}},{"n":"mouth_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":86.2,"ty":162.1}},{"n":"hair_90","t":{"a":-0.42,"b":0.91,"c":0.91,"d":0.42,"tx":84.8,"ty":162.65}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":221.8}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":206.65}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":254.9}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":142.5}}],[{"n":"top_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":109.85,"ty":178.4}},{"n":"hair_back_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":85.15,"ty":165.4}},{"n":"head_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":86.65,"ty":164.95}},{"n":"eyes_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":86.65,"ty":164.95}},{"n":"mouth_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":86.65,"ty":164.95}},{"n":"hair_90","t":{"a":-0.45,"b":0.89,"c":0.89,"d":0.45,"tx":85.15,"ty":165.4}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.85,"ty":225.55}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":210.4}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":140.95,"ty":258.65}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":146.25}}],[{"n":"top_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":109.85,"ty":182.8}},{"n":"hair_back_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":85.65,"ty":168.75}},{"n":"head_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":168.3}},{"n":"eyes_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":168.3}},{"n":"mouth_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":168.3}},{"n":"hair_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":85.65,"ty":168.75}},{"n":"chassis_90","t":{"a":-0.71,"b":0.71,"c":0.71,"d":0.71,"tx":161.85,"ty":230.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":215}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":150.8}}],[{"n":"top_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":109.85,"ty":184}},{"n":"hair_back_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":85.6,"ty":169.95}},{"n":"head_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":87.05,"ty":169.5}},{"n":"eyes_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":87.05,"ty":169.5}},{"n":"mouth_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":87.05,"ty":169.5}},{"n":"hair_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":85.6,"ty":169.95}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.85,"ty":231.05}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.85,"d":0.84,"tx":181.9,"ty":216}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":152.05}}],[{"n":"top_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":109.9,"ty":187.55}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":85.6,"ty":173.7}},{"n":"head_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":87.1,"ty":173.25}},{"n":"eyes_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":87.1,"ty":173.25}},{"n":"mouth_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":87.1,"ty":173.25}},{"n":"hair_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":85.6,"ty":173.7}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.8,"ty":233.85}},{"n":"decal_90","t":{"a":-0.85,"b":0.83,"c":0.85,"d":0.83,"tx":181.9,"ty":218.95}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.75,"c":0.76,"d":0.75,"tx":252.9,"ty":155.75}}],[{"n":"top_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":110,"ty":193.4}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":85.75,"ty":179.7}},{"n":"head_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":87.15,"ty":179.25}},{"n":"eyes_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":87.15,"ty":179.25}},{"n":"mouth_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":87.15,"ty":179.25}},{"n":"hair_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":85.75,"ty":179.7}},{"n":"chassis_90","t":{"a":-0.71,"b":0.68,"c":0.7,"d":0.68,"tx":161.85,"ty":238.6}},{"n":"decal_90","t":{"a":-0.85,"b":0.82,"c":0.84,"d":0.82,"tx":181.85,"ty":224}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.73,"c":0.76,"d":0.74,"tx":252.9,"ty":161.95}}],[{"n":"top_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":110.15,"ty":201.55}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":85.7,"ty":188.25}},{"n":"head_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":87.15,"ty":187.8}},{"n":"eyes_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":87.15,"ty":187.8}},{"n":"mouth_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":87.15,"ty":187.8}},{"n":"hair_90","t":{"a":-0.48,"b":0.82,"c":0.88,"d":0.46,"tx":85.7,"ty":188.25}},{"n":"chassis_90","t":{"a":-0.71,"b":0.66,"c":0.7,"d":0.66,"tx":161.85,"ty":245.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.79,"c":0.85,"d":0.8,"tx":181.85,"ty":230.9}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.71,"c":0.76,"d":0.72,"tx":252.9,"ty":170.7}}],[{"n":"top_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":109.95,"ty":193.8}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":85.75,"ty":180.15}},{"n":"head_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":87.15,"ty":179.7}},{"n":"eyes_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":87.15,"ty":179.7}},{"n":"mouth_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":87.15,"ty":179.7}},{"n":"hair_90","t":{"a":-0.48,"b":0.84,"c":0.87,"d":0.47,"tx":85.75,"ty":180.15}},{"n":"chassis_90","t":{"a":-0.71,"b":0.68,"c":0.7,"d":0.68,"tx":161.85,"ty":239.05}},{"n":"decal_90","t":{"a":-0.85,"b":0.82,"c":0.84,"d":0.82,"tx":181.9,"ty":224.4}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.73,"c":0.76,"d":0.74,"tx":252.85,"ty":162.45}}],[{"n":"top_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":109.95,"ty":188.25}},{"n":"hair_back_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":85.75,"ty":174.35}},{"n":"head_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":87.1,"ty":174}},{"n":"eyes_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":87.1,"ty":174}},{"n":"mouth_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":87.1,"ty":174}},{"n":"hair_90","t":{"a":-0.48,"b":0.86,"c":0.87,"d":0.48,"tx":85.75,"ty":174.35}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.85,"ty":234.65}},{"n":"decal_90","t":{"a":-0.85,"b":0.83,"c":0.85,"d":0.83,"tx":181.95,"ty":219.7}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.75,"c":0.76,"d":0.75,"tx":252.85,"ty":156.6}}],[{"n":"top_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":109.8,"ty":184.9}},{"n":"hair_back_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":85.7,"ty":170.85}},{"n":"head_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":87.05,"ty":170.45}},{"n":"eyes_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":87.05,"ty":170.45}},{"n":"mouth_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":87.05,"ty":170.45}},{"n":"hair_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.48,"tx":85.7,"ty":170.85}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.71,"d":0.7,"tx":161.85,"ty":232.05}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.85,"d":0.84,"tx":181.9,"ty":216.95}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.95,"ty":153}}],[{"n":"top_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":109.85,"ty":183.8}},{"n":"hair_back_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":85.65,"ty":169.75}},{"n":"head_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":169.3}},{"n":"eyes_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":169.3}},{"n":"mouth_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.1,"ty":169.3}},{"n":"hair_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":85.65,"ty":169.75}},{"n":"chassis_90","t":{"a":-0.71,"b":0.71,"c":0.71,"d":0.71,"tx":161.85,"ty":231.15}},{"n":"decal_90","t":{"a":-0.85,"b":0.85,"c":0.85,"d":0.85,"tx":181.9,"ty":216}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":252.9,"ty":151.8}}],[{"n":"top_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":110.15,"ty":183.85}},{"n":"hair_back_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":86.1,"ty":169.7}},{"n":"head_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.5,"ty":169.25}},{"n":"eyes_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.5,"ty":169.25}},{"n":"mouth_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":87.5,"ty":169.25}},{"n":"hair_90","t":{"a":-0.49,"b":0.87,"c":0.87,"d":0.49,"tx":86.1,"ty":169.7}},{"n":"chassis_90","t":{"a":-0.71,"b":0.7,"c":0.7,"d":0.71,"tx":161.95,"ty":231.25}},{"n":"decal_90","t":{"a":-0.85,"b":0.84,"c":0.84,"d":0.85,"tx":181.95,"ty":216.2}},{"n":"wheel_back_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.76,"b":-0.76,"c":0.76,"d":0.76,"tx":253.2,"ty":152.25}}],[{"n":"top_90","t":{"a":-0.5,"b":0.86,"c":0.86,"d":0.5,"tx":111.05,"ty":183.85}},{"n":"hair_back_90","t":{"a":-0.5,"b":0.86,"c":0.86,"d":0.5,"tx":87.35,"ty":169.55}},{"n":"head_90","t":{"a":-0.5,"b":0.86,"c":0.86,"d":0.5,"tx":88.75,"ty":169.1}},{"n":"eyes_90","t":{"a":-0.5,"b":0.86,"c":0.86,"d":0.5,"tx":88.75,"ty":169.1}},{"n":"mouth_90","t":{"a":-0.5,"b":0.86,"c":0.86,"d":0.5,"tx":88.75,"ty":169.1}},{"n":"hair_90","t":{"a":-0.5,"b":0.86,"c":0.86,"d":0.5,"tx":87.35,"ty":169.55}},{"n":"chassis_90","t":{"a":-0.72,"b":0.7,"c":0.7,"d":0.72,"tx":162.15,"ty":231.55}},{"n":"decal_90","t":{"a":-0.86,"b":0.83,"c":0.83,"d":0.86,"tx":182.25,"ty":216.7}},{"n":"wheel_back_90","t":{"a":0.77,"b":-0.75,"c":0.75,"d":0.77,"tx":140.95,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.77,"b":-0.75,"c":0.75,"d":0.77,"tx":254.35,"ty":153.5}}],[{"n":"top_90","t":{"a":-0.52,"b":0.85,"c":0.85,"d":0.52,"tx":112.6,"ty":183.8}},{"n":"hair_back_90","t":{"a":-0.52,"b":0.85,"c":0.85,"d":0.52,"tx":89.45,"ty":169.25}},{"n":"head_90","t":{"a":-0.52,"b":0.85,"c":0.85,"d":0.52,"tx":90.75,"ty":168.85}},{"n":"eyes_90","t":{"a":-0.52,"b":0.85,"c":0.85,"d":0.52,"tx":90.75,"ty":168.85}},{"n":"mouth_90","t":{"a":-0.52,"b":0.85,"c":0.85,"d":0.52,"tx":90.75,"ty":168.85}},{"n":"hair_90","t":{"a":-0.52,"b":0.85,"c":0.85,"d":0.52,"tx":89.45,"ty":169.25}},{"n":"chassis_90","t":{"a":-0.73,"b":0.68,"c":0.68,"d":0.73,"tx":162.6,"ty":232.1}},{"n":"decal_90","t":{"a":-0.87,"b":0.82,"c":0.82,"d":0.87,"tx":182.75,"ty":217.7}},{"n":"wheel_back_90","t":{"a":0.79,"b":-0.74,"c":0.74,"d":0.79,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.79,"b":-0.74,"c":0.74,"d":0.79,"tx":256.25,"ty":155.55}}],[{"n":"top_90","t":{"a":-0.55,"b":0.83,"c":0.83,"d":0.55,"tx":114.75,"ty":183.95}},{"n":"hair_back_90","t":{"a":-0.55,"b":0.83,"c":0.83,"d":0.55,"tx":92.3,"ty":168.9}},{"n":"head_90","t":{"a":-0.55,"b":0.83,"c":0.83,"d":0.55,"tx":93.7,"ty":168.5}},{"n":"eyes_90","t":{"a":-0.55,"b":0.83,"c":0.83,"d":0.55,"tx":93.7,"ty":168.5}},{"n":"mouth_90","t":{"a":-0.55,"b":0.83,"c":0.83,"d":0.55,"tx":93.7,"ty":168.5}},{"n":"hair_90","t":{"a":-0.55,"b":0.83,"c":0.83,"d":0.55,"tx":92.3,"ty":168.9}},{"n":"chassis_90","t":{"a":-0.74,"b":0.67,"c":0.67,"d":0.74,"tx":163.15,"ty":232.8}},{"n":"decal_90","t":{"a":-0.89,"b":0.8,"c":0.8,"d":0.89,"tx":183.5,"ty":219}},{"n":"wheel_back_90","t":{"a":0.8,"b":-0.72,"c":0.72,"d":0.8,"tx":141.05,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.8,"b":-0.72,"c":0.72,"d":0.8,"tx":258.9,"ty":158.6}}],[{"n":"top_90","t":{"a":-0.58,"b":0.81,"c":0.81,"d":0.58,"tx":117.45,"ty":184}},{"n":"hair_back_90","t":{"a":-0.58,"b":0.81,"c":0.81,"d":0.58,"tx":96.05,"ty":168.45}},{"n":"head_90","t":{"a":-0.58,"b":0.81,"c":0.81,"d":0.58,"tx":97.45,"ty":168.1}},{"n":"eyes_90","t":{"a":-0.58,"b":0.81,"c":0.81,"d":0.58,"tx":97.45,"ty":168.1}},{"n":"mouth_90","t":{"a":-0.58,"b":0.81,"c":0.81,"d":0.58,"tx":97.45,"ty":168.1}},{"n":"hair_90","t":{"a":-0.58,"b":0.81,"c":0.81,"d":0.58,"tx":96.05,"ty":168.45}},{"n":"chassis_90","t":{"a":-0.77,"b":0.64,"c":0.64,"d":0.77,"tx":163.9,"ty":233.8}},{"n":"decal_90","t":{"a":-0.92,"b":0.77,"c":0.77,"d":0.92,"tx":184.45,"ty":220.75}},{"n":"wheel_back_90","t":{"a":0.82,"b":-0.69,"c":0.69,"d":0.82,"tx":141.05,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.83,"b":-0.69,"c":0.69,"d":0.83,"tx":262.25,"ty":162.4}}],[{"n":"top_90","t":{"a":-0.63,"b":0.78,"c":0.78,"d":0.63,"tx":120.85,"ty":184.1}},{"n":"hair_back_90","t":{"a":-0.63,"b":0.78,"c":0.78,"d":0.63,"tx":100.65,"ty":167.8}},{"n":"head_90","t":{"a":-0.63,"b":0.78,"c":0.78,"d":0.63,"tx":101.9,"ty":167.6}},{"n":"eyes_90","t":{"a":-0.63,"b":0.78,"c":0.78,"d":0.63,"tx":101.9,"ty":167.6}},{"n":"mouth_90","t":{"a":-0.63,"b":0.78,"c":0.78,"d":0.63,"tx":101.9,"ty":167.6}},{"n":"hair_90","t":{"a":-0.63,"b":0.78,"c":0.78,"d":0.63,"tx":100.65,"ty":167.8}},{"n":"chassis_90","t":{"a":-0.79,"b":0.61,"c":0.61,"d":0.79,"tx":164.75,"ty":234.9}},{"n":"decal_90","t":{"a":-0.95,"b":0.73,"c":0.73,"d":0.95,"tx":185.55,"ty":222.75}},{"n":"wheel_back_90","t":{"a":0.85,"b":-0.66,"c":0.66,"d":0.85,"tx":140.95,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.85,"b":-0.66,"c":0.66,"d":0.85,"tx":266.4,"ty":167.05}}],[{"n":"top_90","t":{"a":-0.67,"b":0.74,"c":0.74,"d":0.67,"tx":124.8,"ty":184.2}},{"n":"hair_back_90","t":{"a":-0.67,"b":0.74,"c":0.74,"d":0.67,"tx":106,"ty":167.1}},{"n":"head_90","t":{"a":-0.67,"b":0.74,"c":0.74,"d":0.67,"tx":107.3,"ty":167}},{"n":"eyes_90","t":{"a":-0.67,"b":0.74,"c":0.74,"d":0.67,"tx":107.3,"ty":167}},{"n":"mouth_90","t":{"a":-0.67,"b":0.74,"c":0.74,"d":0.67,"tx":107.3,"ty":167}},{"n":"hair_90","t":{"a":-0.67,"b":0.74,"c":0.74,"d":0.67,"tx":106,"ty":167.1}},{"n":"chassis_90","t":{"a":-0.82,"b":0.57,"c":0.57,"d":0.82,"tx":165.75,"ty":236.3}},{"n":"decal_90","t":{"a":-0.98,"b":0.69,"c":0.69,"d":0.98,"tx":186.9,"ty":225.2}},{"n":"wheel_back_90","t":{"a":0.88,"b":-0.62,"c":0.62,"d":0.88,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.88,"b":-0.62,"c":0.62,"d":0.88,"tx":271.25,"ty":172.6}}],[{"n":"top_90","t":{"a":-0.72,"b":0.69,"c":0.69,"d":0.72,"tx":129.3,"ty":184.4}},{"n":"hair_back_90","t":{"a":-0.72,"b":0.69,"c":0.69,"d":0.72,"tx":112.25,"ty":166.35}},{"n":"head_90","t":{"a":-0.72,"b":0.69,"c":0.69,"d":0.72,"tx":113.55,"ty":166.25}},{"n":"eyes_90","t":{"a":-0.72,"b":0.69,"c":0.69,"d":0.72,"tx":113.55,"ty":166.25}},{"n":"mouth_90","t":{"a":-0.72,"b":0.69,"c":0.69,"d":0.72,"tx":113.55,"ty":166.25}},{"n":"hair_90","t":{"a":-0.72,"b":0.69,"c":0.69,"d":0.72,"tx":112.25,"ty":166.35}},{"n":"chassis_90","t":{"a":-0.85,"b":0.53,"c":0.53,"d":0.85,"tx":167.1,"ty":237.95}},{"n":"decal_90","t":{"a":-1.01,"b":0.64,"c":0.64,"d":1.01,"tx":188.4,"ty":228.1}},{"n":"wheel_back_90","t":{"a":0.91,"b":-0.57,"c":0.57,"d":0.91,"tx":141,"ty":263.25}},{"n":"wheel_front_90","t":{"a":0.93,"b":-0.55,"c":0.55,"d":0.93,"tx":275.75,"ty":180}}],[{"n":"top_90","t":{"a":-0.78,"b":0.63,"c":0.63,"d":0.78,"tx":134.55,"ty":184.4}},{"n":"hair_back_90","t":{"a":-0.78,"b":0.63,"c":0.63,"d":0.78,"tx":119.25,"ty":165.4}},{"n":"head_90","t":{"a":-0.78,"b":0.63,"c":0.63,"d":0.78,"tx":120.5,"ty":165.45}},{"n":"eyes_90","t":{"a":-0.78,"b":0.63,"c":0.63,"d":0.78,"tx":120.5,"ty":165.45}},{"n":"mouth_90","t":{"a":-0.78,"b":0.63,"c":0.63,"d":0.78,"tx":120.5,"ty":165.45}},{"n":"hair_90","t":{"a":-0.78,"b":0.63,"c":0.63,"d":0.78,"tx":119.25,"ty":165.4}},{"n":"chassis_90","t":{"a":-0.88,"b":0.48,"c":0.48,"d":0.88,"tx":168.45,"ty":239.65}},{"n":"decal_90","t":{"a":-1.05,"b":0.58,"c":0.58,"d":1.05,"tx":190.2,"ty":231.25}},{"n":"wheel_back_90","t":{"a":0.94,"b":-0.52,"c":0.52,"d":0.94,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":0.97,"b":-0.48,"c":0.48,"d":0.97,"tx":280.25,"ty":187.25}}],[{"n":"top_90","t":{"a":-0.83,"b":0.56,"c":0.56,"d":0.83,"tx":140.4,"ty":184.6}},{"n":"hair_back_90","t":{"a":-0.83,"b":0.56,"c":0.56,"d":0.83,"tx":127.15,"ty":164.4}},{"n":"head_90","t":{"a":-0.83,"b":0.56,"c":0.56,"d":0.83,"tx":128.4,"ty":164.55}},{"n":"eyes_90","t":{"a":-0.83,"b":0.56,"c":0.56,"d":0.83,"tx":128.4,"ty":164.55}},{"n":"mouth_90","t":{"a":-0.83,"b":0.56,"c":0.56,"d":0.83,"tx":128.4,"ty":164.55}},{"n":"hair_90","t":{"a":-0.83,"b":0.56,"c":0.56,"d":0.83,"tx":127.15,"ty":164.4}},{"n":"chassis_90","t":{"a":-0.91,"b":0.42,"c":0.42,"d":0.91,"tx":169.95,"ty":241.75}},{"n":"decal_90","t":{"a":-1.09,"b":0.5,"c":0.5,"d":1.09,"tx":192.1,"ty":234.85}},{"n":"wheel_back_90","t":{"a":0.98,"b":-0.46,"c":0.46,"d":0.98,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1,"b":-0.4,"c":0.4,"d":1,"tx":284.8,"ty":197.1}}],[{"n":"top_90","t":{"a":-0.88,"b":0.47,"c":0.47,"d":0.88,"tx":146.75,"ty":184.8}},{"n":"hair_back_90","t":{"a":-0.88,"b":0.47,"c":0.47,"d":0.88,"tx":135.85,"ty":163.25}},{"n":"head_90","t":{"a":-0.88,"b":0.47,"c":0.47,"d":0.88,"tx":137.05,"ty":163.5}},{"n":"eyes_90","t":{"a":-0.88,"b":0.47,"c":0.47,"d":0.88,"tx":137.05,"ty":163.5}},{"n":"mouth_90","t":{"a":-0.88,"b":0.47,"c":0.47,"d":0.88,"tx":137.05,"ty":163.5}},{"n":"hair_90","t":{"a":-0.88,"b":0.47,"c":0.47,"d":0.88,"tx":135.85,"ty":163.25}},{"n":"chassis_90","t":{"a":-0.93,"b":0.35,"c":0.35,"d":0.93,"tx":171.65,"ty":244}},{"n":"decal_90","t":{"a":-1.12,"b":0.43,"c":0.43,"d":1.12,"tx":194.25,"ty":238.85}},{"n":"wheel_back_90","t":{"a":1.01,"b":-0.38,"c":0.38,"d":1.01,"tx":141.05,"ty":263.25}},{"n":"wheel_front_90","t":{"a":1.03,"b":-0.32,"c":0.32,"d":1.03,"tx":289.45,"ty":206.95}}],[{"n":"top_90","t":{"a":-0.93,"b":0.37,"c":0.37,"d":0.93,"tx":153.8,"ty":185.05}},{"n":"hair_back_90","t":{"a":-0.93,"b":0.37,"c":0.37,"d":0.93,"tx":145.4,"ty":162.05}},{"n":"head_90","t":{"a":-0.93,"b":0.37,"c":0.37,"d":0.93,"tx":146.5,"ty":162.45}},{"n":"eyes_90","t":{"a":-0.93,"b":0.37,"c":0.37,"d":0.93,"tx":146.5,"ty":162.45}},{"n":"mouth_90","t":{"a":-0.93,"b":0.37,"c":0.37,"d":0.93,"tx":146.5,"ty":162.45}},{"n":"hair_90","t":{"a":-0.93,"b":0.37,"c":0.37,"d":0.93,"tx":145.4,"ty":162.05}},{"n":"chassis_90","t":{"a":-0.96,"b":0.28,"c":0.28,"d":0.96,"tx":173.5,"ty":246.45}},{"n":"decal_90","t":{"a":-1.15,"b":0.33,"c":0.33,"d":1.15,"tx":196.7,"ty":243.2}},{"n":"wheel_back_90","t":{"a":1.04,"b":-0.3,"c":0.3,"d":1.04,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.05,"b":-0.24,"c":0.24,"d":1.05,"tx":293.6,"ty":219.95}}],[{"n":"top_90","t":{"a":-0.96,"b":0.26,"c":0.26,"d":0.96,"tx":161.4,"ty":185.2}},{"n":"hair_back_90","t":{"a":-0.96,"b":0.26,"c":0.26,"d":0.96,"tx":155.75,"ty":160.7}},{"n":"head_90","t":{"a":-0.96,"b":0.26,"c":0.26,"d":0.96,"tx":156.85,"ty":161.3}},{"n":"eyes_90","t":{"a":-0.96,"b":0.26,"c":0.26,"d":0.96,"tx":156.85,"ty":161.3}},{"n":"mouth_90","t":{"a":-0.96,"b":0.26,"c":0.26,"d":0.96,"tx":156.85,"ty":161.3}},{"n":"hair_90","t":{"a":-0.96,"b":0.26,"c":0.26,"d":0.96,"tx":155.75,"ty":160.7}},{"n":"chassis_90","t":{"a":-0.98,"b":0.19,"c":0.19,"d":0.98,"tx":175.55,"ty":249.1}},{"n":"decal_90","t":{"a":-1.18,"b":0.23,"c":0.23,"d":1.18,"tx":199.2,"ty":247.95}},{"n":"wheel_back_90","t":{"a":1.06,"b":-0.21,"c":0.21,"d":1.06,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.07,"b":-0.16,"c":0.16,"d":1.07,"tx":297.6,"ty":233.05}}],[{"n":"top_90","t":{"a":-0.99,"b":0.14,"c":0.14,"d":0.99,"tx":169.6,"ty":185.4}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.14,"c":0.14,"d":0.99,"tx":167,"ty":159.2}},{"n":"head_90","t":{"a":-0.99,"b":0.14,"c":0.14,"d":0.99,"tx":168.05,"ty":160}},{"n":"eyes_90","t":{"a":-0.99,"b":0.14,"c":0.14,"d":0.99,"tx":168.05,"ty":160}},{"n":"mouth_90","t":{"a":-0.99,"b":0.14,"c":0.14,"d":0.99,"tx":168.05,"ty":160}},{"n":"hair_90","t":{"a":-0.99,"b":0.14,"c":0.14,"d":0.99,"tx":167,"ty":159.2}},{"n":"chassis_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":177.75,"ty":252}},{"n":"decal_90","t":{"a":-1.19,"b":0.12,"c":0.12,"d":1.19,"tx":202,"ty":253}},{"n":"wheel_back_90","t":{"a":1.07,"b":-0.11,"c":0.11,"d":1.07,"tx":141.05,"ty":263.25}},{"n":"wheel_front_90","t":{"a":1.08,"b":-0.08,"c":0.08,"d":1.08,"tx":299.1,"ty":248.25}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":185.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.02,"c":-0.02,"d":1,"tx":180.4,"ty":182.8}},{"n":"hair_back_90","t":{"a":-1,"b":-0.02,"c":-0.02,"d":1,"tx":181.6,"ty":154.8}},{"n":"head_90","t":{"a":-1,"b":-0.02,"c":-0.02,"d":1,"tx":182.6,"ty":155.8}},{"n":"eyes_90","t":{"a":-1,"b":-0.02,"c":-0.02,"d":1,"tx":182.6,"ty":155.8}},{"n":"mouth_90","t":{"a":-1,"b":-0.02,"c":-0.02,"d":1,"tx":182.6,"ty":155.8}},{"n":"hair_90","t":{"a":-1,"b":-0.02,"c":-0.02,"d":1,"tx":181.6,"ty":154.8}},{"n":"chassis_90","t":{"a":-1,"b":-0.02,"c":-0.02,"d":1,"tx":180.4,"ty":252.15}},{"n":"decal_90","t":{"a":-1.2,"b":-0.03,"c":-0.03,"d":1.2,"tx":205.15,"ty":256.25}},{"n":"wheel_back_90","t":{"a":1.08,"b":0.02,"c":-0.02,"d":1.08,"tx":141.1,"ty":259.45}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":182,"ty":180.45}},{"n":"hair_back_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":183.75,"ty":152.45}},{"n":"head_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":184.7,"ty":153.5}},{"n":"eyes_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":184.7,"ty":153.5}},{"n":"mouth_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":184.7,"ty":153.5}},{"n":"hair_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":183.75,"ty":152.45}},{"n":"chassis_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":180.65,"ty":249.75}},{"n":"decal_90","t":{"a":-1.2,"b":-0.05,"c":-0.05,"d":1.2,"tx":205.3,"ty":254.35}},{"n":"wheel_back_90","t":{"a":1.08,"b":0.04,"c":-0.04,"d":1.08,"tx":141.2,"ty":256.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0.01,"c":-0.01,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.06,"c":-0.06,"d":1,"tx":183.2,"ty":178.6}},{"n":"hair_back_90","t":{"a":-1,"b":-0.06,"c":-0.06,"d":1,"tx":185.4,"ty":150.65}},{"n":"head_90","t":{"a":-1,"b":-0.06,"c":-0.06,"d":1,"tx":186.35,"ty":151.7}},{"n":"eyes_90","t":{"a":-1,"b":-0.06,"c":-0.06,"d":1,"tx":186.35,"ty":151.7}},{"n":"mouth_90","t":{"a":-1,"b":-0.06,"c":-0.06,"d":1,"tx":186.35,"ty":151.7}},{"n":"hair_90","t":{"a":-1,"b":-0.06,"c":-0.06,"d":1,"tx":185.4,"ty":150.65}},{"n":"chassis_90","t":{"a":-1,"b":-0.06,"c":-0.06,"d":1,"tx":180.8,"ty":247.9}},{"n":"decal_90","t":{"a":-1.2,"b":-0.07,"c":-0.07,"d":1.2,"tx":205.4,"ty":252.8}},{"n":"wheel_back_90","t":{"a":1.08,"b":0.06,"c":-0.06,"d":1.08,"tx":141.3,"ty":253.85}},{"n":"wheel_front_90","t":{"a":1.08,"b":0.02,"c":-0.02,"d":1.08,"tx":300.6,"ty":263.25}}],[{"n":"top_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":184.1,"ty":177.3}},{"n":"hair_back_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":186.6,"ty":149.35}},{"n":"head_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":187.5,"ty":150.45}},{"n":"eyes_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":187.5,"ty":150.45}},{"n":"mouth_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":187.5,"ty":150.45}},{"n":"hair_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":186.6,"ty":149.35}},{"n":"chassis_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":180.95,"ty":246.55}},{"n":"decal_90","t":{"a":-1.2,"b":-0.08,"c":-0.08,"d":1.2,"tx":205.5,"ty":251.8}},{"n":"wheel_back_90","t":{"a":1.08,"b":0.07,"c":-0.07,"d":1.08,"tx":141.35,"ty":252.1}},{"n":"wheel_front_90","t":{"a":1.08,"b":0.03,"c":-0.03,"d":1.08,"tx":300.6,"ty":263.25}}],[{"n":"top_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":184.6,"ty":176.5}},{"n":"hair_back_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":187.3,"ty":148.55}},{"n":"head_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":188.2,"ty":149.65}},{"n":"eyes_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":188.2,"ty":149.65}},{"n":"mouth_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":188.2,"ty":149.65}},{"n":"hair_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":187.3,"ty":148.55}},{"n":"chassis_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":181,"ty":245.7}},{"n":"decal_90","t":{"a":-1.2,"b":-0.09,"c":-0.09,"d":1.2,"tx":205.5,"ty":251.15}},{"n":"wheel_back_90","t":{"a":1.08,"b":0.08,"c":-0.08,"d":1.08,"tx":141.4,"ty":251.05}},{"n":"wheel_front_90","t":{"a":1.08,"b":0.06,"c":-0.06,"d":1.08,"tx":300.5,"ty":263.25}}],[{"n":"top_90","t":{"a":-1,"b":-0.08,"c":-0.08,"d":1,"tx":184.8,"ty":176.25}},{"n":"hair_back_90","t":{"a":-1,"b":-0.08,"c":-0.08,"d":1,"tx":187.55,"ty":148.3}},{"n":"head_90","t":{"a":-1,"b":-0.08,"c":-0.08,"d":1,"tx":188.45,"ty":149.4}},{"n":"eyes_90","t":{"a":-1,"b":-0.08,"c":-0.08,"d":1,"tx":188.45,"ty":149.4}},{"n":"mouth_90","t":{"a":-1,"b":-0.08,"c":-0.08,"d":1,"tx":188.45,"ty":149.4}},{"n":"hair_90","t":{"a":-1,"b":-0.08,"c":-0.08,"d":1,"tx":187.55,"ty":148.3}},{"n":"chassis_90","t":{"a":-1,"b":-0.08,"c":-0.08,"d":1,"tx":181.05,"ty":245.5}},{"n":"decal_90","t":{"a":-1.2,"b":-0.09,"c":-0.09,"d":1.2,"tx":205.55,"ty":250.95}},{"n":"wheel_back_90","t":{"a":1.08,"b":0.08,"c":-0.08,"d":1.08,"tx":141.4,"ty":250.7}},{"n":"wheel_front_90","t":{"a":1.08,"b":0.08,"c":-0.08,"d":1.08,"tx":300.55,"ty":263.15}}],[{"n":"top_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":184.55,"ty":176.7}},{"n":"hair_back_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":187.15,"ty":148.65}},{"n":"head_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":188.15,"ty":149.7}},{"n":"eyes_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":188.15,"ty":149.7}},{"n":"mouth_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":188.15,"ty":149.7}},{"n":"hair_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":187.15,"ty":148.65}},{"n":"chassis_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":181,"ty":245.9}},{"n":"decal_90","t":{"a":-1.2,"b":-0.09,"c":-0.09,"d":1.2,"tx":205.65,"ty":251.2}},{"n":"wheel_back_90","t":{"a":1.08,"b":0.08,"c":-0.08,"d":1.08,"tx":141.45,"ty":251.15}},{"n":"wheel_front_90","t":{"a":1.08,"b":0.08,"c":-0.08,"d":1.08,"tx":300.55,"ty":263.15}}],[{"n":"top_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":183.8,"ty":177.8}},{"n":"hair_back_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":186.1,"ty":149.8}},{"n":"head_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":187.15,"ty":150.85}},{"n":"eyes_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":187.15,"ty":150.85}},{"n":"mouth_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":187.15,"ty":150.85}},{"n":"hair_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":186.1,"ty":149.8}},{"n":"chassis_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":180.9,"ty":247.05}},{"n":"decal_90","t":{"a":-1.2,"b":-0.08,"c":-0.08,"d":1.2,"tx":205.55,"ty":252.05}},{"n":"wheel_back_90","t":{"a":1.08,"b":0.07,"c":-0.07,"d":1.08,"tx":141.4,"ty":252.65}},{"n":"wheel_front_90","t":{"a":1.08,"b":0.07,"c":-0.07,"d":1.08,"tx":300.55,"ty":263.1}}],[{"n":"top_90","t":{"a":-1,"b":-0.05,"c":-0.05,"d":1,"tx":182.45,"ty":179.65}},{"n":"hair_back_90","t":{"a":-1,"b":-0.05,"c":-0.05,"d":1,"tx":184.4,"ty":151.65}},{"n":"head_90","t":{"a":-1,"b":-0.05,"c":-0.05,"d":1,"tx":185.45,"ty":152.75}},{"n":"eyes_90","t":{"a":-1,"b":-0.05,"c":-0.05,"d":1,"tx":185.45,"ty":152.75}},{"n":"mouth_90","t":{"a":-1,"b":-0.05,"c":-0.05,"d":1,"tx":185.45,"ty":152.75}},{"n":"hair_90","t":{"a":-1,"b":-0.05,"c":-0.05,"d":1,"tx":184.4,"ty":151.65}},{"n":"chassis_90","t":{"a":-1,"b":-0.05,"c":-0.05,"d":1,"tx":180.7,"ty":248.95}},{"n":"decal_90","t":{"a":-1.2,"b":-0.06,"c":-0.06,"d":1.2,"tx":205.4,"ty":253.6}},{"n":"wheel_back_90","t":{"a":1.08,"b":0.05,"c":-0.05,"d":1.08,"tx":141.25,"ty":255.2}},{"n":"wheel_front_90","t":{"a":1.08,"b":0.05,"c":-0.05,"d":1.08,"tx":300.6,"ty":263.2}}],[{"n":"top_90","t":{"a":-1,"b":-0.03,"c":-0.03,"d":1,"tx":180.75,"ty":182.25}},{"n":"hair_back_90","t":{"a":-1,"b":-0.03,"c":-0.03,"d":1,"tx":182.1,"ty":154.3}},{"n":"head_90","t":{"a":-1,"b":-0.03,"c":-0.03,"d":1,"tx":183.15,"ty":155.3}},{"n":"eyes_90","t":{"a":-1,"b":-0.03,"c":-0.03,"d":1,"tx":183.15,"ty":155.3}},{"n":"mouth_90","t":{"a":-1,"b":-0.03,"c":-0.03,"d":1,"tx":183.15,"ty":155.3}},{"n":"hair_90","t":{"a":-1,"b":-0.03,"c":-0.03,"d":1,"tx":182.1,"ty":154.3}},{"n":"chassis_90","t":{"a":-1,"b":-0.03,"c":-0.03,"d":1,"tx":180.5,"ty":251.6}},{"n":"decal_90","t":{"a":-1.2,"b":-0.03,"c":-0.03,"d":1.2,"tx":205.25,"ty":255.75}},{"n":"wheel_back_90","t":{"a":1.08,"b":0.03,"c":-0.03,"d":1.08,"tx":141.15,"ty":258.75}},{"n":"wheel_front_90","t":{"a":1.08,"b":0.03,"c":-0.03,"d":1.08,"tx":300.6,"ty":263.2}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":185.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":177.8,"ty":185.35}},{"n":"hair_back_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":178.1,"ty":157.35}},{"n":"head_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":179.1,"ty":158.35}},{"n":"eyes_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":179.1,"ty":158.35}},{"n":"mouth_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":179.1,"ty":158.35}},{"n":"hair_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":178.1,"ty":157.35}},{"n":"chassis_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":180,"ty":254.75}},{"n":"decal_90","t":{"a":-1.2,"b":0.01,"c":0.01,"d":1.2,"tx":204.95,"ty":258}},{"n":"wheel_back_90","t":{"a":1.08,"b":-0.01,"c":0.01,"d":1.08,"tx":140.95,"ty":263.35}},{"n":"wheel_front_90","t":{"a":1.08,"b":-0.01,"c":0.01,"d":1.08,"tx":300.55,"ty":261.95}}],[{"n":"top_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":177.15,"ty":185.1}},{"n":"hair_back_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":177.25,"ty":157.05}},{"n":"head_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":178.25,"ty":158.05}},{"n":"eyes_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":178.25,"ty":158.05}},{"n":"mouth_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":178.25,"ty":158.05}},{"n":"hair_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":177.25,"ty":157.05}},{"n":"chassis_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":180,"ty":254.4}},{"n":"decal_90","t":{"a":-1.2,"b":0.02,"c":0.02,"d":1.2,"tx":204.9,"ty":257.5}},{"n":"wheel_back_90","t":{"a":1.08,"b":-0.02,"c":0.02,"d":1.08,"tx":140.95,"ty":263.35}},{"n":"wheel_front_90","t":{"a":1.08,"b":-0.02,"c":0.02,"d":1.08,"tx":300.55,"ty":260.65}}],[{"n":"top_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":176.45,"ty":184.8}},{"n":"hair_back_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":176.3,"ty":156.75}},{"n":"head_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":177.3,"ty":157.75}},{"n":"eyes_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":177.3,"ty":157.75}},{"n":"mouth_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":177.3,"ty":157.75}},{"n":"hair_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":176.3,"ty":156.75}},{"n":"chassis_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":179.85,"ty":254.1}},{"n":"decal_90","t":{"a":-1.2,"b":0.03,"c":0.03,"d":1.2,"tx":204.85,"ty":256.95}},{"n":"wheel_back_90","t":{"a":1.08,"b":-0.03,"c":0.03,"d":1.08,"tx":140.95,"ty":263.35}},{"n":"wheel_front_90","t":{"a":1.08,"b":-0.03,"c":0.03,"d":1.08,"tx":300.5,"ty":259.3}}],[{"n":"top_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":177.15,"ty":185.15}},{"n":"hair_back_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":177.25,"ty":157.05}},{"n":"head_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":178.2,"ty":158.05}},{"n":"eyes_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":178.2,"ty":158.05}},{"n":"mouth_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":178.2,"ty":158.05}},{"n":"hair_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":177.25,"ty":157.05}},{"n":"chassis_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":180,"ty":254.45}},{"n":"decal_90","t":{"a":-1.2,"b":0.02,"c":0.02,"d":1.2,"tx":204.85,"ty":257.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":-0.02,"c":0.02,"d":1.08,"tx":141,"ty":263.4}},{"n":"wheel_front_90","t":{"a":1.08,"b":-0.02,"c":0.02,"d":1.08,"tx":300.5,"ty":260.65}}],[{"n":"top_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":177.8,"ty":185.3}},{"n":"hair_back_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":178.1,"ty":157.35}},{"n":"head_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":179.1,"ty":158.35}},{"n":"eyes_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":179.1,"ty":158.35}},{"n":"mouth_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":179.1,"ty":158.35}},{"n":"hair_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":178.1,"ty":157.35}},{"n":"chassis_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":180,"ty":254.8}},{"n":"decal_90","t":{"a":-1.2,"b":0.01,"c":0.01,"d":1.2,"tx":204.95,"ty":258.05}},{"n":"wheel_back_90","t":{"a":1.08,"b":-0.01,"c":0.01,"d":1.08,"tx":141,"ty":263.4}},{"n":"wheel_front_90","t":{"a":1.08,"b":-0.01,"c":0.01,"d":1.08,"tx":300.5,"ty":261.95}}]],"hop_back_90_next":["loop"],"hop_front_90_next":["loop"],"hop_front_90":[[{"n":"top_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":178.75,"ty":185.65}},{"n":"hair_back_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":177.2,"ty":157.9}},{"n":"head_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":178.3,"ty":158.8}},{"n":"eyes_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":178.3,"ty":158.8}},{"n":"mouth_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":178.3,"ty":158.8}},{"n":"hair_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":177.2,"ty":157.9}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":-0.11,"c":-0.11,"d":0.99,"tx":178.75,"ty":186.05}},{"n":"hair_back_90","t":{"a":-0.99,"b":-0.11,"c":-0.11,"d":0.99,"tx":182.45,"ty":159.4}},{"n":"head_90","t":{"a":-0.99,"b":-0.11,"c":-0.11,"d":0.99,"tx":183.2,"ty":160.4}},{"n":"eyes_90","t":{"a":-0.99,"b":-0.11,"c":-0.11,"d":0.99,"tx":183.2,"ty":160.4}},{"n":"mouth_90","t":{"a":-0.99,"b":-0.11,"c":-0.11,"d":0.99,"tx":183.2,"ty":160.4}},{"n":"hair_90","t":{"a":-0.99,"b":-0.11,"c":-0.11,"d":0.99,"tx":182.45,"ty":159.4}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.95,"b":-0.3,"c":-0.3,"d":0.95,"tx":178.85,"ty":186.4}},{"n":"hair_back_90","t":{"a":-0.95,"b":-0.3,"c":-0.3,"d":0.95,"tx":187.55,"ty":160.95}},{"n":"head_90","t":{"a":-0.95,"b":-0.3,"c":-0.3,"d":0.95,"tx":188.25,"ty":162.1}},{"n":"eyes_90","t":{"a":-0.95,"b":-0.3,"c":-0.3,"d":0.95,"tx":188.25,"ty":162.1}},{"n":"mouth_90","t":{"a":-0.95,"b":-0.3,"c":-0.3,"d":0.95,"tx":188.25,"ty":162.1}},{"n":"hair_90","t":{"a":-0.95,"b":-0.3,"c":-0.3,"d":0.95,"tx":187.55,"ty":160.95}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.88,"b":-0.48,"c":-0.48,"d":0.88,"tx":178.95,"ty":186.8}},{"n":"hair_back_90","t":{"a":-0.88,"b":-0.48,"c":-0.48,"d":0.88,"tx":192.75,"ty":162.45}},{"n":"head_90","t":{"a":-0.88,"b":-0.48,"c":-0.48,"d":0.88,"tx":193.2,"ty":163.8}},{"n":"eyes_90","t":{"a":-0.88,"b":-0.48,"c":-0.48,"d":0.88,"tx":193.2,"ty":163.8}},{"n":"mouth_90","t":{"a":-0.88,"b":-0.48,"c":-0.48,"d":0.88,"tx":193.2,"ty":163.8}},{"n":"hair_90","t":{"a":-0.88,"b":-0.48,"c":-0.48,"d":0.88,"tx":192.75,"ty":162.45}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.83,"b":-0.56,"c":-0.56,"d":0.83,"tx":201,"ty":175.1}},{"n":"hair_back_90","t":{"a":-0.85,"b":-0.52,"c":-0.52,"d":0.85,"tx":216.5,"ty":152.5}},{"n":"head_90","t":{"a":-0.85,"b":-0.52,"c":-0.52,"d":0.85,"tx":216.95,"ty":153.85}},{"n":"eyes_90","t":{"a":-0.85,"b":-0.52,"c":-0.52,"d":0.85,"tx":216.95,"ty":153.85}},{"n":"mouth_90","t":{"a":-0.85,"b":-0.52,"c":-0.52,"d":0.85,"tx":216.95,"ty":153.85}},{"n":"hair_90","t":{"a":-0.85,"b":-0.52,"c":-0.52,"d":0.85,"tx":216.5,"ty":152.5}},{"n":"chassis_90","t":{"a":-0.98,"b":-0.18,"c":-0.18,"d":0.98,"tx":191.75,"ty":237.9}},{"n":"decal_90","t":{"a":-1.18,"b":-0.21,"c":-0.21,"d":1.18,"tx":214,"ty":244.8}},{"n":"wheel_back_90","t":{"a":1.06,"b":0.19,"c":-0.19,"d":1.06,"tx":143.45,"ty":235.1}},{"n":"wheel_front_90","t":{"a":1.06,"b":0.19,"c":-0.19,"d":1.06,"tx":300.8,"ty":263.4}}],[{"n":"top_90","t":{"a":-0.78,"b":-0.62,"c":-0.62,"d":0.78,"tx":220.85,"ty":164.5}},{"n":"hair_back_90","t":{"a":-0.83,"b":-0.56,"c":-0.56,"d":0.83,"tx":237.95,"ty":143.45}},{"n":"head_90","t":{"a":-0.83,"b":-0.56,"c":-0.56,"d":0.83,"tx":238.3,"ty":144.9}},{"n":"eyes_90","t":{"a":-0.83,"b":-0.56,"c":-0.56,"d":0.83,"tx":238.3,"ty":144.9}},{"n":"mouth_90","t":{"a":-0.83,"b":-0.56,"c":-0.56,"d":0.83,"tx":238.3,"ty":144.9}},{"n":"hair_90","t":{"a":-0.83,"b":-0.56,"c":-0.56,"d":0.83,"tx":237.95,"ty":143.45}},{"n":"chassis_90","t":{"a":-0.94,"b":-0.33,"c":-0.33,"d":0.94,"tx":202.25,"ty":222.35}},{"n":"decal_90","t":{"a":-1.13,"b":-0.4,"c":-0.4,"d":1.13,"tx":222.15,"ty":232.35}},{"n":"wheel_back_90","t":{"a":1.02,"b":0.36,"c":-0.36,"d":1.02,"tx":150.15,"ty":210.15}},{"n":"wheel_front_90","t":{"a":1.02,"b":0.36,"c":-0.36,"d":1.02,"tx":301,"ty":263.5}}],[{"n":"top_90","t":{"a":-0.73,"b":-0.68,"c":-0.68,"d":0.73,"tx":238.75,"ty":155}},{"n":"hair_back_90","t":{"a":-0.81,"b":-0.59,"c":-0.59,"d":0.81,"tx":257.2,"ty":135.35}},{"n":"head_90","t":{"a":-0.81,"b":-0.59,"c":-0.59,"d":0.81,"tx":257.55,"ty":136.85}},{"n":"eyes_90","t":{"a":-0.81,"b":-0.59,"c":-0.59,"d":0.81,"tx":257.55,"ty":136.85}},{"n":"mouth_90","t":{"a":-0.81,"b":-0.59,"c":-0.59,"d":0.81,"tx":257.55,"ty":136.85}},{"n":"hair_90","t":{"a":-0.81,"b":-0.59,"c":-0.59,"d":0.81,"tx":257.2,"ty":135.35}},{"n":"chassis_90","t":{"a":-0.88,"b":-0.47,"c":-0.47,"d":0.88,"tx":211.7,"ty":208.45}},{"n":"decal_90","t":{"a":-1.06,"b":-0.56,"c":-0.56,"d":1.06,"tx":229.45,"ty":221.25}},{"n":"wheel_back_90","t":{"a":0.95,"b":0.5,"c":-0.5,"d":0.95,"tx":159.75,"ty":188.5}},{"n":"wheel_front_90","t":{"a":0.95,"b":0.5,"c":-0.5,"d":0.95,"tx":301.15,"ty":263.55}}],[{"n":"top_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":254.5,"ty":146.6}},{"n":"hair_back_90","t":{"a":-0.79,"b":-0.62,"c":-0.62,"d":0.79,"tx":274.2,"ty":128.2}},{"n":"head_90","t":{"a":-0.79,"b":-0.62,"c":-0.62,"d":0.79,"tx":274.4,"ty":129.75}},{"n":"eyes_90","t":{"a":-0.79,"b":-0.62,"c":-0.62,"d":0.79,"tx":274.4,"ty":129.75}},{"n":"mouth_90","t":{"a":-0.79,"b":-0.62,"c":-0.62,"d":0.79,"tx":274.4,"ty":129.75}},{"n":"hair_90","t":{"a":-0.79,"b":-0.62,"c":-0.62,"d":0.79,"tx":274.2,"ty":128.2}},{"n":"chassis_90","t":{"a":-0.82,"b":-0.57,"c":-0.57,"d":0.82,"tx":220,"ty":196.2}},{"n":"decal_90","t":{"a":-0.98,"b":-0.69,"c":-0.69,"d":0.98,"tx":235.85,"ty":211.4}},{"n":"wheel_back_90","t":{"a":0.88,"b":0.62,"c":-0.62,"d":0.88,"tx":170.8,"ty":171.3}},{"n":"wheel_front_90","t":{"a":0.88,"b":0.62,"c":-0.62,"d":0.88,"tx":301.25,"ty":263.7}}],[{"n":"top_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":268.1,"ty":139.35}},{"n":"hair_back_90","t":{"a":-0.77,"b":-0.64,"c":-0.64,"d":0.77,"tx":288.9,"ty":122.05}},{"n":"head_90","t":{"a":-0.77,"b":-0.64,"c":-0.64,"d":0.77,"tx":289.05,"ty":123.5}},{"n":"eyes_90","t":{"a":-0.77,"b":-0.64,"c":-0.64,"d":0.77,"tx":289.05,"ty":123.5}},{"n":"mouth_90","t":{"a":-0.77,"b":-0.64,"c":-0.64,"d":0.77,"tx":289.05,"ty":123.5}},{"n":"hair_90","t":{"a":-0.77,"b":-0.64,"c":-0.64,"d":0.77,"tx":288.9,"ty":122.05}},{"n":"chassis_90","t":{"a":-0.75,"b":-0.66,"c":-0.66,"d":0.75,"tx":227.2,"ty":185.55}},{"n":"decal_90","t":{"a":-0.9,"b":-0.8,"c":-0.8,"d":0.9,"tx":241.4,"ty":202.9}},{"n":"wheel_back_90","t":{"a":0.81,"b":0.72,"c":-0.72,"d":0.81,"tx":181.8,"ty":157.4}},{"n":"wheel_front_90","t":{"a":0.81,"b":0.72,"c":-0.72,"d":0.81,"tx":301.35,"ty":263.7}}],[{"n":"top_90","t":{"a":-0.6,"b":-0.8,"c":-0.8,"d":0.6,"tx":279.6,"ty":133.2}},{"n":"hair_back_90","t":{"a":-0.75,"b":-0.66,"c":-0.66,"d":0.75,"tx":301.35,"ty":116.8}},{"n":"head_90","t":{"a":-0.75,"b":-0.66,"c":-0.66,"d":0.75,"tx":301.45,"ty":118.3}},{"n":"eyes_90","t":{"a":-0.75,"b":-0.66,"c":-0.66,"d":0.75,"tx":301.45,"ty":118.3}},{"n":"mouth_90","t":{"a":-0.75,"b":-0.66,"c":-0.66,"d":0.75,"tx":301.45,"ty":118.3}},{"n":"hair_90","t":{"a":-0.75,"b":-0.66,"c":-0.66,"d":0.75,"tx":301.35,"ty":116.8}},{"n":"chassis_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":233.3,"ty":176.6}},{"n":"decal_90","t":{"a":-0.82,"b":-0.87,"c":-0.87,"d":0.82,"tx":246.15,"ty":195.7}},{"n":"wheel_back_90","t":{"a":0.74,"b":0.79,"c":-0.79,"d":0.74,"tx":192.4,"ty":146.2}},{"n":"wheel_front_90","t":{"a":0.74,"b":0.79,"c":-0.79,"d":0.74,"tx":301.45,"ty":263.8}}],[{"n":"top_90","t":{"a":-0.57,"b":-0.82,"c":-0.82,"d":0.57,"tx":289.1,"ty":128.15}},{"n":"hair_back_90","t":{"a":-0.73,"b":-0.68,"c":-0.68,"d":0.73,"tx":311.55,"ty":112.55}},{"n":"head_90","t":{"a":-0.73,"b":-0.68,"c":-0.68,"d":0.73,"tx":311.6,"ty":114.05}},{"n":"eyes_90","t":{"a":-0.73,"b":-0.68,"c":-0.68,"d":0.73,"tx":311.6,"ty":114.05}},{"n":"mouth_90","t":{"a":-0.73,"b":-0.68,"c":-0.68,"d":0.73,"tx":311.6,"ty":114.05}},{"n":"hair_90","t":{"a":-0.73,"b":-0.68,"c":-0.68,"d":0.73,"tx":311.55,"ty":112.55}},{"n":"chassis_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":238.3,"ty":169.25}},{"n":"decal_90","t":{"a":-0.75,"b":-0.94,"c":-0.94,"d":0.75,"tx":250,"ty":189.8}},{"n":"wheel_back_90","t":{"a":0.67,"b":0.84,"c":-0.84,"d":0.67,"tx":202.1,"ty":138.05}},{"n":"wheel_front_90","t":{"a":0.67,"b":0.84,"c":-0.84,"d":0.67,"tx":301.55,"ty":263.8}}],[{"n":"top_90","t":{"a":-0.54,"b":-0.84,"c":-0.84,"d":0.54,"tx":296.45,"ty":124.3}},{"n":"hair_back_90","t":{"a":-0.72,"b":-0.69,"c":-0.69,"d":0.72,"tx":319.4,"ty":109.2}},{"n":"head_90","t":{"a":-0.72,"b":-0.69,"c":-0.69,"d":0.72,"tx":319.55,"ty":110.7}},{"n":"eyes_90","t":{"a":-0.72,"b":-0.69,"c":-0.69,"d":0.72,"tx":319.55,"ty":110.7}},{"n":"mouth_90","t":{"a":-0.72,"b":-0.69,"c":-0.69,"d":0.72,"tx":319.55,"ty":110.7}},{"n":"hair_90","t":{"a":-0.72,"b":-0.69,"c":-0.69,"d":0.72,"tx":319.4,"ty":109.2}},{"n":"chassis_90","t":{"a":-0.57,"b":-0.82,"c":-0.82,"d":0.57,"tx":242.15,"ty":163.5}},{"n":"decal_90","t":{"a":-0.69,"b":-0.98,"c":-0.98,"d":0.69,"tx":253,"ty":185.25}},{"n":"wheel_back_90","t":{"a":0.62,"b":0.88,"c":-0.88,"d":0.62,"tx":210.35,"ty":132.65}},{"n":"wheel_front_90","t":{"a":0.62,"b":0.88,"c":-0.88,"d":0.62,"tx":301.6,"ty":263.8}}],[{"n":"top_90","t":{"a":-0.53,"b":-0.85,"c":-0.85,"d":0.53,"tx":301.7,"ty":121.45}},{"n":"hair_back_90","t":{"a":-0.72,"b":-0.7,"c":-0.7,"d":0.72,"tx":325.1,"ty":106.9}},{"n":"head_90","t":{"a":-0.72,"b":-0.7,"c":-0.7,"d":0.72,"tx":325.15,"ty":108.35}},{"n":"eyes_90","t":{"a":-0.72,"b":-0.7,"c":-0.7,"d":0.72,"tx":325.15,"ty":108.35}},{"n":"mouth_90","t":{"a":-0.72,"b":-0.7,"c":-0.7,"d":0.72,"tx":325.15,"ty":108.35}},{"n":"hair_90","t":{"a":-0.72,"b":-0.7,"c":-0.7,"d":0.72,"tx":325.1,"ty":106.9}},{"n":"chassis_90","t":{"a":-0.54,"b":-0.84,"c":-0.84,"d":0.54,"tx":244.95,"ty":159.4}},{"n":"decal_90","t":{"a":-0.65,"b":-1.01,"c":-1.01,"d":0.65,"tx":255.15,"ty":181.9}},{"n":"wheel_back_90","t":{"a":0.58,"b":0.91,"c":-0.91,"d":0.58,"tx":215.95,"ty":129}},{"n":"wheel_front_90","t":{"a":0.58,"b":0.91,"c":-0.91,"d":0.58,"tx":301.7,"ty":263.85}}],[{"n":"top_90","t":{"a":-0.52,"b":-0.86,"c":-0.86,"d":0.52,"tx":304.8,"ty":119.75}},{"n":"hair_back_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":328.5,"ty":105.5}},{"n":"head_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":328.45,"ty":106.9}},{"n":"eyes_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":328.45,"ty":106.9}},{"n":"mouth_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":328.45,"ty":106.9}},{"n":"hair_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":328.5,"ty":105.5}},{"n":"chassis_90","t":{"a":-0.52,"b":-0.85,"c":-0.85,"d":0.52,"tx":246.6,"ty":156.95}},{"n":"decal_90","t":{"a":-0.62,"b":-1.02,"c":-1.02,"d":0.62,"tx":256.4,"ty":180}},{"n":"wheel_back_90","t":{"a":0.56,"b":0.92,"c":-0.92,"d":0.56,"tx":220.15,"ty":126.85}},{"n":"wheel_front_90","t":{"a":0.56,"b":0.92,"c":-0.92,"d":0.56,"tx":301.75,"ty":263.9}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":119.2}},{"n":"hair_back_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":105}},{"n":"head_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":106.45}},{"n":"eyes_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":106.45}},{"n":"mouth_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":106.45}},{"n":"hair_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":105}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":156.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":179.35}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":126.75}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.75,"ty":263.85}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":122.95}},{"n":"hair_back_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":108.75}},{"n":"head_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":110.15}},{"n":"eyes_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":110.15}},{"n":"mouth_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":110.15}},{"n":"hair_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":108.75}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":159.85}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":183.05}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":130.5}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":263.8}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":129.2}},{"n":"hair_back_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":115}},{"n":"head_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":116.45}},{"n":"eyes_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":116.45}},{"n":"mouth_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":116.45}},{"n":"hair_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":115}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":166.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":189.35}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":136.75}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.75,"ty":263.85}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":121.95}},{"n":"hair_back_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.8,"ty":108}},{"n":"head_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.65,"ty":109.45}},{"n":"eyes_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.65,"ty":109.45}},{"n":"mouth_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.65,"ty":109.45}},{"n":"hair_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.8,"ty":108}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":157.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":180.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":127.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":258.4}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":116.35}},{"n":"hair_back_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.8,"ty":102.5}},{"n":"head_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.75,"ty":103.85}},{"n":"eyes_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.75,"ty":103.85}},{"n":"mouth_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.75,"ty":103.85}},{"n":"hair_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.8,"ty":102.5}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":150.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":173.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":120.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":254.2}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":112.35}},{"n":"hair_back_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.95,"ty":98.55}},{"n":"head_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.8,"ty":100}},{"n":"eyes_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.8,"ty":100}},{"n":"mouth_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.8,"ty":100}},{"n":"hair_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.95,"ty":98.55}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":145.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":168.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":115.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":251.2}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":109.95}},{"n":"hair_back_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":330,"ty":96.15}},{"n":"head_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":329.75,"ty":97.6}},{"n":"eyes_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":329.75,"ty":97.6}},{"n":"mouth_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":329.75,"ty":97.6}},{"n":"hair_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":330,"ty":96.15}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":142.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":165.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":112.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":249.4}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":109.2}},{"n":"hair_back_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":330,"ty":95.4}},{"n":"head_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.8,"ty":96.85}},{"n":"eyes_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.8,"ty":96.85}},{"n":"mouth_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.8,"ty":96.85}},{"n":"hair_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":330,"ty":95.4}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":141.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":164.35}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":111.75}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.75,"ty":248.85}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":109.5}},{"n":"hair_back_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.9,"ty":95.65}},{"n":"head_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.85,"ty":97.1}},{"n":"eyes_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.85,"ty":97.1}},{"n":"mouth_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.85,"ty":97.1}},{"n":"hair_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.9,"ty":95.65}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":141.6}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":164.75}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":112.15}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":249.25}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":110.3}},{"n":"hair_back_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.95,"ty":96.45}},{"n":"head_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.85,"ty":97.9}},{"n":"eyes_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.85,"ty":97.9}},{"n":"mouth_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.85,"ty":97.9}},{"n":"hair_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.95,"ty":96.45}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":142.85}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":166}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":113.4}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":250.5}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":111.7}},{"n":"hair_back_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.85,"ty":97.75}},{"n":"head_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.8,"ty":99.25}},{"n":"eyes_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.8,"ty":99.25}},{"n":"mouth_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.8,"ty":99.25}},{"n":"hair_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.85,"ty":97.75}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":144.95}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":168.1}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":115.5}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":252.6}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":113.65}},{"n":"hair_back_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.8,"ty":99.65}},{"n":"head_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.75,"ty":101.15}},{"n":"eyes_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.75,"ty":101.15}},{"n":"mouth_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.75,"ty":101.15}},{"n":"hair_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.8,"ty":99.65}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":147.85}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":171}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":118.4}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":255.5}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":116.15}},{"n":"hair_back_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.7,"ty":102}},{"n":"head_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.75,"ty":103.45}},{"n":"eyes_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.75,"ty":103.45}},{"n":"mouth_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.75,"ty":103.45}},{"n":"hair_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.7,"ty":102}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":151.6}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":174.75}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":122.15}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":259.25}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":119.2}},{"n":"hair_back_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":105}},{"n":"head_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":106.45}},{"n":"eyes_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":106.45}},{"n":"mouth_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":106.45}},{"n":"hair_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":105}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":156.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":179.35}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":126.75}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.75,"ty":263.85}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":122.95}},{"n":"hair_back_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":108.75}},{"n":"head_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":110.15}},{"n":"eyes_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":110.15}},{"n":"mouth_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":110.15}},{"n":"hair_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":108.75}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":159.85}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":183.05}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":130.5}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":263.8}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":129.2}},{"n":"hair_back_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":115}},{"n":"head_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":116.45}},{"n":"eyes_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":116.45}},{"n":"mouth_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":116.45}},{"n":"hair_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":115}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":166.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":189.35}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":136.75}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.75,"ty":263.85}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":121.95}},{"n":"hair_back_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.8,"ty":108}},{"n":"head_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.65,"ty":109.45}},{"n":"eyes_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.65,"ty":109.45}},{"n":"mouth_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.65,"ty":109.45}},{"n":"hair_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.8,"ty":108}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":157.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":180.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":127.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":258.4}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":116.35}},{"n":"hair_back_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.8,"ty":102.5}},{"n":"head_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.75,"ty":103.85}},{"n":"eyes_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.75,"ty":103.85}},{"n":"mouth_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.75,"ty":103.85}},{"n":"hair_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.8,"ty":102.5}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":150.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":173.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":120.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":254.2}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":112.35}},{"n":"hair_back_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.95,"ty":98.55}},{"n":"head_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.8,"ty":100}},{"n":"eyes_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.8,"ty":100}},{"n":"mouth_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.8,"ty":100}},{"n":"hair_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.95,"ty":98.55}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":145.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":168.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":115.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":251.2}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":109.95}},{"n":"hair_back_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":330,"ty":96.15}},{"n":"head_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":329.75,"ty":97.6}},{"n":"eyes_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":329.75,"ty":97.6}},{"n":"mouth_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":329.75,"ty":97.6}},{"n":"hair_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":330,"ty":96.15}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":142.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":165.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":112.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":249.4}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":109.2}},{"n":"hair_back_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":330,"ty":95.4}},{"n":"head_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.8,"ty":96.85}},{"n":"eyes_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.8,"ty":96.85}},{"n":"mouth_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.8,"ty":96.85}},{"n":"hair_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":330,"ty":95.4}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":141.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":164.35}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":111.75}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.75,"ty":248.85}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":109.5}},{"n":"hair_back_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.9,"ty":95.65}},{"n":"head_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.85,"ty":97.1}},{"n":"eyes_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.85,"ty":97.1}},{"n":"mouth_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.85,"ty":97.1}},{"n":"hair_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.9,"ty":95.65}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":141.6}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":164.75}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":112.15}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":249.25}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":110.3}},{"n":"hair_back_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.95,"ty":96.45}},{"n":"head_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.85,"ty":97.9}},{"n":"eyes_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.85,"ty":97.9}},{"n":"mouth_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.85,"ty":97.9}},{"n":"hair_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.95,"ty":96.45}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":142.85}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":166}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":113.4}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":250.5}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":111.7}},{"n":"hair_back_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.85,"ty":97.75}},{"n":"head_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.8,"ty":99.25}},{"n":"eyes_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.8,"ty":99.25}},{"n":"mouth_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.8,"ty":99.25}},{"n":"hair_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.85,"ty":97.75}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":144.95}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":168.1}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":115.5}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":252.6}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":113.65}},{"n":"hair_back_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.8,"ty":99.65}},{"n":"head_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.75,"ty":101.15}},{"n":"eyes_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.75,"ty":101.15}},{"n":"mouth_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.75,"ty":101.15}},{"n":"hair_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.8,"ty":99.65}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":147.85}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":171}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":118.4}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":255.5}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":116.15}},{"n":"hair_back_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.7,"ty":102}},{"n":"head_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.75,"ty":103.45}},{"n":"eyes_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.75,"ty":103.45}},{"n":"mouth_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.75,"ty":103.45}},{"n":"hair_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.7,"ty":102}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":151.6}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":174.75}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":122.15}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":259.25}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":119.2}},{"n":"hair_back_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":105}},{"n":"head_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":106.45}},{"n":"eyes_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":106.45}},{"n":"mouth_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":106.45}},{"n":"hair_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":105}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":156.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":179.35}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":126.75}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.75,"ty":263.85}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":122.95}},{"n":"hair_back_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":108.75}},{"n":"head_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":110.15}},{"n":"eyes_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":110.15}},{"n":"mouth_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":110.15}},{"n":"hair_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":108.75}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":159.85}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":183.05}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":130.5}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":263.8}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":129.2}},{"n":"hair_back_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":115}},{"n":"head_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":116.45}},{"n":"eyes_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":116.45}},{"n":"mouth_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":116.45}},{"n":"hair_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":115}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":166.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":189.35}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":136.75}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.75,"ty":263.85}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":121.95}},{"n":"hair_back_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.8,"ty":108}},{"n":"head_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.65,"ty":109.45}},{"n":"eyes_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.65,"ty":109.45}},{"n":"mouth_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.65,"ty":109.45}},{"n":"hair_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.8,"ty":108}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":157.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":180.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":127.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":258.4}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":116.35}},{"n":"hair_back_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.8,"ty":102.5}},{"n":"head_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.75,"ty":103.85}},{"n":"eyes_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.75,"ty":103.85}},{"n":"mouth_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.75,"ty":103.85}},{"n":"hair_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.8,"ty":102.5}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":150.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":173.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":120.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":254.2}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":112.35}},{"n":"hair_back_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.95,"ty":98.55}},{"n":"head_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.8,"ty":100}},{"n":"eyes_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.8,"ty":100}},{"n":"mouth_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.8,"ty":100}},{"n":"hair_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.95,"ty":98.55}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":145.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":168.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":115.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":251.2}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":109.95}},{"n":"hair_back_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":330,"ty":96.15}},{"n":"head_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":329.75,"ty":97.6}},{"n":"eyes_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":329.75,"ty":97.6}},{"n":"mouth_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":329.75,"ty":97.6}},{"n":"hair_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":330,"ty":96.15}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":142.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":165.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":112.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":249.4}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":109.2}},{"n":"hair_back_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":330,"ty":95.4}},{"n":"head_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.8,"ty":96.85}},{"n":"eyes_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.8,"ty":96.85}},{"n":"mouth_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.8,"ty":96.85}},{"n":"hair_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":330,"ty":95.4}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":141.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":164.35}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":111.75}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.75,"ty":248.85}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":109.5}},{"n":"hair_back_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.9,"ty":95.65}},{"n":"head_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.85,"ty":97.1}},{"n":"eyes_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.85,"ty":97.1}},{"n":"mouth_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.85,"ty":97.1}},{"n":"hair_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.9,"ty":95.65}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":141.6}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":164.75}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":112.15}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":249.25}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":110.3}},{"n":"hair_back_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.95,"ty":96.45}},{"n":"head_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.85,"ty":97.9}},{"n":"eyes_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.85,"ty":97.9}},{"n":"mouth_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.85,"ty":97.9}},{"n":"hair_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.95,"ty":96.45}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":142.85}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":166}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":113.4}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":250.5}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":111.7}},{"n":"hair_back_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.85,"ty":97.75}},{"n":"head_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.8,"ty":99.25}},{"n":"eyes_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.8,"ty":99.25}},{"n":"mouth_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.8,"ty":99.25}},{"n":"hair_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.85,"ty":97.75}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":144.95}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":168.1}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":115.5}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":252.6}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":113.65}},{"n":"hair_back_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.8,"ty":99.65}},{"n":"head_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.75,"ty":101.15}},{"n":"eyes_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.75,"ty":101.15}},{"n":"mouth_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.75,"ty":101.15}},{"n":"hair_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.8,"ty":99.65}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":147.85}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":171}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":118.4}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":255.5}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":116.15}},{"n":"hair_back_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.7,"ty":102}},{"n":"head_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.75,"ty":103.45}},{"n":"eyes_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.75,"ty":103.45}},{"n":"mouth_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.75,"ty":103.45}},{"n":"hair_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.7,"ty":102}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":151.6}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":174.75}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":122.15}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":259.25}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":119.2}},{"n":"hair_back_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":105}},{"n":"head_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":106.45}},{"n":"eyes_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":106.45}},{"n":"mouth_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":106.45}},{"n":"hair_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":105}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":156.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":179.35}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":126.75}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.75,"ty":263.85}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":122.95}},{"n":"hair_back_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":108.75}},{"n":"head_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":110.15}},{"n":"eyes_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":110.15}},{"n":"mouth_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":110.15}},{"n":"hair_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":108.75}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":159.85}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":183.05}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":130.5}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":263.8}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":129.2}},{"n":"hair_back_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":115}},{"n":"head_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":116.45}},{"n":"eyes_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":116.45}},{"n":"mouth_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":116.45}},{"n":"hair_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":115}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":166.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":189.35}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":136.75}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.75,"ty":263.85}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":121.95}},{"n":"hair_back_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.8,"ty":108}},{"n":"head_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.65,"ty":109.45}},{"n":"eyes_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.65,"ty":109.45}},{"n":"mouth_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.65,"ty":109.45}},{"n":"hair_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.8,"ty":108}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":157.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":180.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":127.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":258.4}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":116.35}},{"n":"hair_back_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.8,"ty":102.5}},{"n":"head_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.75,"ty":103.85}},{"n":"eyes_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.75,"ty":103.85}},{"n":"mouth_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.75,"ty":103.85}},{"n":"hair_90","t":{"a":-0.65,"b":-0.76,"c":-0.76,"d":0.65,"tx":329.8,"ty":102.5}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":150.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":173.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":120.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":254.2}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":112.35}},{"n":"hair_back_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.95,"ty":98.55}},{"n":"head_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.8,"ty":100}},{"n":"eyes_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.8,"ty":100}},{"n":"mouth_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.8,"ty":100}},{"n":"hair_90","t":{"a":-0.63,"b":-0.77,"c":-0.77,"d":0.63,"tx":329.95,"ty":98.55}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":145.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":168.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":115.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":251.2}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":109.95}},{"n":"hair_back_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":330,"ty":96.15}},{"n":"head_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":329.75,"ty":97.6}},{"n":"eyes_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":329.75,"ty":97.6}},{"n":"mouth_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":329.75,"ty":97.6}},{"n":"hair_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":330,"ty":96.15}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.2,"ty":142.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.8,"ty":165.3}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.1,"ty":112.7}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":249.4}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":109.2}},{"n":"hair_back_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":330,"ty":95.4}},{"n":"head_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.8,"ty":96.85}},{"n":"eyes_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.8,"ty":96.85}},{"n":"mouth_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.8,"ty":96.85}},{"n":"hair_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":330,"ty":95.4}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":141.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":164.35}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":111.75}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.75,"ty":248.85}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":109.5}},{"n":"hair_back_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.9,"ty":95.65}},{"n":"head_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.85,"ty":97.1}},{"n":"eyes_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.85,"ty":97.1}},{"n":"mouth_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.85,"ty":97.1}},{"n":"hair_90","t":{"a":-0.62,"b":-0.79,"c":-0.79,"d":0.62,"tx":329.9,"ty":95.65}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":141.6}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":164.75}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":112.15}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":249.25}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":110.3}},{"n":"hair_back_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.95,"ty":96.45}},{"n":"head_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.85,"ty":97.9}},{"n":"eyes_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.85,"ty":97.9}},{"n":"mouth_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.85,"ty":97.9}},{"n":"hair_90","t":{"a":-0.63,"b":-0.78,"c":-0.78,"d":0.63,"tx":329.95,"ty":96.45}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":142.85}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":166}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":113.4}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":250.5}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":111.7}},{"n":"hair_back_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.85,"ty":97.75}},{"n":"head_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.8,"ty":99.25}},{"n":"eyes_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.8,"ty":99.25}},{"n":"mouth_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.8,"ty":99.25}},{"n":"hair_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":329.85,"ty":97.75}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":144.95}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":168.1}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":115.5}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":252.6}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":113.65}},{"n":"hair_back_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.8,"ty":99.65}},{"n":"head_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.75,"ty":101.15}},{"n":"eyes_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.75,"ty":101.15}},{"n":"mouth_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.75,"ty":101.15}},{"n":"hair_90","t":{"a":-0.66,"b":-0.75,"c":-0.75,"d":0.66,"tx":329.8,"ty":99.65}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":147.85}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":171}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":118.4}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":255.5}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.85,"ty":116.15}},{"n":"hair_back_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.7,"ty":102}},{"n":"head_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.75,"ty":103.45}},{"n":"eyes_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.75,"ty":103.45}},{"n":"mouth_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.75,"ty":103.45}},{"n":"hair_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":329.7,"ty":102}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":151.6}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":174.75}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":122.15}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.7,"ty":259.25}}],[{"n":"top_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":305.9,"ty":119.2}},{"n":"hair_back_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":105}},{"n":"head_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":106.45}},{"n":"eyes_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":106.45}},{"n":"mouth_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":106.45}},{"n":"hair_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":329.65,"ty":105}},{"n":"chassis_90","t":{"a":-0.51,"b":-0.86,"c":-0.86,"d":0.51,"tx":247.15,"ty":156.15}},{"n":"decal_90","t":{"a":-0.61,"b":-1.03,"c":-1.03,"d":0.61,"tx":256.85,"ty":179.35}},{"n":"wheel_back_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":220.05,"ty":126.75}},{"n":"wheel_front_90","t":{"a":0.55,"b":0.93,"c":-0.93,"d":0.55,"tx":301.75,"ty":263.85}}],[{"n":"top_90","t":{"a":-0.52,"b":-0.86,"c":-0.86,"d":0.52,"tx":304.9,"ty":119.65}},{"n":"hair_back_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":328.45,"ty":105.5}},{"n":"head_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":328.5,"ty":106.9}},{"n":"eyes_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":328.5,"ty":106.9}},{"n":"mouth_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":328.5,"ty":106.9}},{"n":"hair_90","t":{"a":-0.71,"b":-0.7,"c":-0.7,"d":0.71,"tx":328.45,"ty":105.5}},{"n":"chassis_90","t":{"a":-0.52,"b":-0.85,"c":-0.85,"d":0.52,"tx":246.6,"ty":156.95}},{"n":"decal_90","t":{"a":-0.62,"b":-1.02,"c":-1.02,"d":0.62,"tx":256.4,"ty":179.95}},{"n":"wheel_back_90","t":{"a":0.56,"b":0.92,"c":-0.92,"d":0.56,"tx":220.15,"ty":126.85}},{"n":"wheel_front_90","t":{"a":0.56,"b":0.92,"c":-0.92,"d":0.56,"tx":301.75,"ty":263.85}}],[{"n":"top_90","t":{"a":-0.53,"b":-0.85,"c":-0.85,"d":0.53,"tx":301.65,"ty":121.4}},{"n":"hair_back_90","t":{"a":-0.72,"b":-0.7,"c":-0.7,"d":0.72,"tx":325.05,"ty":106.85}},{"n":"head_90","t":{"a":-0.72,"b":-0.7,"c":-0.7,"d":0.72,"tx":325.2,"ty":108.3}},{"n":"eyes_90","t":{"a":-0.72,"b":-0.7,"c":-0.7,"d":0.72,"tx":325.2,"ty":108.3}},{"n":"mouth_90","t":{"a":-0.72,"b":-0.7,"c":-0.7,"d":0.72,"tx":325.2,"ty":108.3}},{"n":"hair_90","t":{"a":-0.72,"b":-0.7,"c":-0.7,"d":0.72,"tx":325.05,"ty":106.85}},{"n":"chassis_90","t":{"a":-0.54,"b":-0.84,"c":-0.84,"d":0.54,"tx":244.95,"ty":159.35}},{"n":"decal_90","t":{"a":-0.65,"b":-1.01,"c":-1.01,"d":0.65,"tx":255.15,"ty":181.85}},{"n":"wheel_back_90","t":{"a":0.58,"b":0.91,"c":-0.91,"d":0.58,"tx":215.95,"ty":129}},{"n":"wheel_front_90","t":{"a":0.58,"b":0.91,"c":-0.91,"d":0.58,"tx":301.65,"ty":263.85}}],[{"n":"top_90","t":{"a":-0.54,"b":-0.84,"c":-0.84,"d":0.54,"tx":296.5,"ty":124.15}},{"n":"hair_back_90","t":{"a":-0.72,"b":-0.69,"c":-0.69,"d":0.72,"tx":319.45,"ty":109.25}},{"n":"head_90","t":{"a":-0.72,"b":-0.69,"c":-0.69,"d":0.72,"tx":319.5,"ty":110.7}},{"n":"eyes_90","t":{"a":-0.72,"b":-0.69,"c":-0.69,"d":0.72,"tx":319.5,"ty":110.7}},{"n":"mouth_90","t":{"a":-0.72,"b":-0.69,"c":-0.69,"d":0.72,"tx":319.5,"ty":110.7}},{"n":"hair_90","t":{"a":-0.72,"b":-0.69,"c":-0.69,"d":0.72,"tx":319.45,"ty":109.25}},{"n":"chassis_90","t":{"a":-0.57,"b":-0.82,"c":-0.82,"d":0.57,"tx":242.15,"ty":163.45}},{"n":"decal_90","t":{"a":-0.69,"b":-0.98,"c":-0.98,"d":0.69,"tx":253,"ty":185.2}},{"n":"wheel_back_90","t":{"a":0.62,"b":0.88,"c":-0.88,"d":0.62,"tx":210.35,"ty":132.65}},{"n":"wheel_front_90","t":{"a":0.62,"b":0.88,"c":-0.88,"d":0.62,"tx":301.65,"ty":263.8}}],[{"n":"top_90","t":{"a":-0.57,"b":-0.82,"c":-0.82,"d":0.57,"tx":289.1,"ty":128.1}},{"n":"hair_back_90","t":{"a":-0.73,"b":-0.68,"c":-0.68,"d":0.73,"tx":311.5,"ty":112.6}},{"n":"head_90","t":{"a":-0.73,"b":-0.68,"c":-0.68,"d":0.73,"tx":311.55,"ty":114}},{"n":"eyes_90","t":{"a":-0.73,"b":-0.68,"c":-0.68,"d":0.73,"tx":311.55,"ty":114}},{"n":"mouth_90","t":{"a":-0.73,"b":-0.68,"c":-0.68,"d":0.73,"tx":311.55,"ty":114}},{"n":"hair_90","t":{"a":-0.73,"b":-0.68,"c":-0.68,"d":0.73,"tx":311.5,"ty":112.6}},{"n":"chassis_90","t":{"a":-0.62,"b":-0.78,"c":-0.78,"d":0.62,"tx":238.25,"ty":169.25}},{"n":"decal_90","t":{"a":-0.75,"b":-0.94,"c":-0.94,"d":0.75,"tx":250,"ty":189.7}},{"n":"wheel_back_90","t":{"a":0.67,"b":0.84,"c":-0.84,"d":0.67,"tx":202.1,"ty":138.05}},{"n":"wheel_front_90","t":{"a":0.67,"b":0.84,"c":-0.84,"d":0.67,"tx":301.6,"ty":263.8}}],[{"n":"top_90","t":{"a":-0.6,"b":-0.8,"c":-0.8,"d":0.6,"tx":279.6,"ty":133.15}},{"n":"hair_back_90","t":{"a":-0.75,"b":-0.66,"c":-0.66,"d":0.75,"tx":301.35,"ty":116.8}},{"n":"head_90","t":{"a":-0.75,"b":-0.66,"c":-0.66,"d":0.75,"tx":301.45,"ty":118.25}},{"n":"eyes_90","t":{"a":-0.75,"b":-0.66,"c":-0.66,"d":0.75,"tx":301.45,"ty":118.25}},{"n":"mouth_90","t":{"a":-0.75,"b":-0.66,"c":-0.66,"d":0.75,"tx":301.45,"ty":118.25}},{"n":"hair_90","t":{"a":-0.75,"b":-0.66,"c":-0.66,"d":0.75,"tx":301.35,"ty":116.8}},{"n":"chassis_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":233.3,"ty":176.6}},{"n":"decal_90","t":{"a":-0.82,"b":-0.87,"c":-0.87,"d":0.82,"tx":246.2,"ty":195.65}},{"n":"wheel_back_90","t":{"a":0.74,"b":0.79,"c":-0.79,"d":0.74,"tx":192.4,"ty":146.2}},{"n":"wheel_front_90","t":{"a":0.74,"b":0.79,"c":-0.79,"d":0.74,"tx":301.5,"ty":263.75}}],[{"n":"top_90","t":{"a":-0.64,"b":-0.77,"c":-0.77,"d":0.64,"tx":268.15,"ty":139.25}},{"n":"hair_back_90","t":{"a":-0.77,"b":-0.64,"c":-0.64,"d":0.77,"tx":288.85,"ty":122.1}},{"n":"head_90","t":{"a":-0.77,"b":-0.64,"c":-0.64,"d":0.77,"tx":289.1,"ty":123.55}},{"n":"eyes_90","t":{"a":-0.77,"b":-0.64,"c":-0.64,"d":0.77,"tx":289.1,"ty":123.55}},{"n":"mouth_90","t":{"a":-0.77,"b":-0.64,"c":-0.64,"d":0.77,"tx":289.1,"ty":123.55}},{"n":"hair_90","t":{"a":-0.77,"b":-0.64,"c":-0.64,"d":0.77,"tx":288.85,"ty":122.1}},{"n":"chassis_90","t":{"a":-0.75,"b":-0.66,"c":-0.66,"d":0.75,"tx":227.2,"ty":185.55}},{"n":"decal_90","t":{"a":-0.9,"b":-0.8,"c":-0.8,"d":0.9,"tx":241.45,"ty":202.85}},{"n":"wheel_back_90","t":{"a":0.81,"b":0.72,"c":-0.72,"d":0.81,"tx":181.8,"ty":157.4}},{"n":"wheel_front_90","t":{"a":0.81,"b":0.72,"c":-0.72,"d":0.81,"tx":301.4,"ty":263.75}}],[{"n":"top_90","t":{"a":-0.68,"b":-0.73,"c":-0.73,"d":0.68,"tx":254.5,"ty":146.55}},{"n":"hair_back_90","t":{"a":-0.79,"b":-0.62,"c":-0.62,"d":0.79,"tx":274.15,"ty":128.25}},{"n":"head_90","t":{"a":-0.79,"b":-0.62,"c":-0.62,"d":0.79,"tx":274.4,"ty":129.7}},{"n":"eyes_90","t":{"a":-0.79,"b":-0.62,"c":-0.62,"d":0.79,"tx":274.4,"ty":129.7}},{"n":"mouth_90","t":{"a":-0.79,"b":-0.62,"c":-0.62,"d":0.79,"tx":274.4,"ty":129.7}},{"n":"hair_90","t":{"a":-0.79,"b":-0.62,"c":-0.62,"d":0.79,"tx":274.15,"ty":128.25}},{"n":"chassis_90","t":{"a":-0.82,"b":-0.57,"c":-0.57,"d":0.82,"tx":220,"ty":196.2}},{"n":"decal_90","t":{"a":-0.98,"b":-0.69,"c":-0.69,"d":0.98,"tx":235.85,"ty":211.35}},{"n":"wheel_back_90","t":{"a":0.88,"b":0.62,"c":-0.62,"d":0.88,"tx":170.8,"ty":171.3}},{"n":"wheel_front_90","t":{"a":0.88,"b":0.62,"c":-0.62,"d":0.88,"tx":301.25,"ty":263.6}}],[{"n":"top_90","t":{"a":-0.73,"b":-0.68,"c":-0.68,"d":0.73,"tx":238.75,"ty":154.9}},{"n":"hair_back_90","t":{"a":-0.81,"b":-0.59,"c":-0.59,"d":0.81,"tx":257.2,"ty":135.4}},{"n":"head_90","t":{"a":-0.81,"b":-0.59,"c":-0.59,"d":0.81,"tx":257.5,"ty":136.8}},{"n":"eyes_90","t":{"a":-0.81,"b":-0.59,"c":-0.59,"d":0.81,"tx":257.5,"ty":136.8}},{"n":"mouth_90","t":{"a":-0.81,"b":-0.59,"c":-0.59,"d":0.81,"tx":257.5,"ty":136.8}},{"n":"hair_90","t":{"a":-0.81,"b":-0.59,"c":-0.59,"d":0.81,"tx":257.2,"ty":135.4}},{"n":"chassis_90","t":{"a":-0.88,"b":-0.47,"c":-0.47,"d":0.88,"tx":211.65,"ty":208.5}},{"n":"decal_90","t":{"a":-1.06,"b":-0.56,"c":-0.56,"d":1.06,"tx":229.4,"ty":221.15}},{"n":"wheel_back_90","t":{"a":0.95,"b":0.5,"c":-0.5,"d":0.95,"tx":159.75,"ty":188.5}},{"n":"wheel_front_90","t":{"a":0.95,"b":0.5,"c":-0.5,"d":0.95,"tx":301.2,"ty":263.55}}],[{"n":"top_90","t":{"a":-0.78,"b":-0.62,"c":-0.62,"d":0.78,"tx":220.9,"ty":164.4}},{"n":"hair_back_90","t":{"a":-0.83,"b":-0.56,"c":-0.56,"d":0.83,"tx":238,"ty":143.45}},{"n":"head_90","t":{"a":-0.83,"b":-0.56,"c":-0.56,"d":0.83,"tx":238.3,"ty":144.9}},{"n":"eyes_90","t":{"a":-0.83,"b":-0.56,"c":-0.56,"d":0.83,"tx":238.3,"ty":144.9}},{"n":"mouth_90","t":{"a":-0.83,"b":-0.56,"c":-0.56,"d":0.83,"tx":238.3,"ty":144.9}},{"n":"hair_90","t":{"a":-0.83,"b":-0.56,"c":-0.56,"d":0.83,"tx":238,"ty":143.45}},{"n":"chassis_90","t":{"a":-0.94,"b":-0.33,"c":-0.33,"d":0.94,"tx":202.2,"ty":222.35}},{"n":"decal_90","t":{"a":-1.13,"b":-0.4,"c":-0.4,"d":1.13,"tx":222.15,"ty":232.35}},{"n":"wheel_back_90","t":{"a":1.02,"b":0.36,"c":-0.36,"d":1.02,"tx":150.15,"ty":210.15}},{"n":"wheel_front_90","t":{"a":1.02,"b":0.36,"c":-0.36,"d":1.02,"tx":301,"ty":263.5}}],[{"n":"top_90","t":{"a":-0.83,"b":-0.56,"c":-0.56,"d":0.83,"tx":200.95,"ty":175.05}},{"n":"hair_back_90","t":{"a":-0.85,"b":-0.52,"c":-0.52,"d":0.85,"tx":216.45,"ty":152.5}},{"n":"head_90","t":{"a":-0.85,"b":-0.52,"c":-0.52,"d":0.85,"tx":216.9,"ty":153.85}},{"n":"eyes_90","t":{"a":-0.85,"b":-0.52,"c":-0.52,"d":0.85,"tx":216.9,"ty":153.85}},{"n":"mouth_90","t":{"a":-0.85,"b":-0.52,"c":-0.52,"d":0.85,"tx":216.9,"ty":153.85}},{"n":"hair_90","t":{"a":-0.85,"b":-0.52,"c":-0.52,"d":0.85,"tx":216.45,"ty":152.5}},{"n":"chassis_90","t":{"a":-0.98,"b":-0.18,"c":-0.18,"d":0.98,"tx":191.7,"ty":237.9}},{"n":"decal_90","t":{"a":-1.18,"b":-0.21,"c":-0.21,"d":1.18,"tx":214,"ty":244.75}},{"n":"wheel_back_90","t":{"a":1.06,"b":0.19,"c":-0.19,"d":1.06,"tx":143.45,"ty":235.1}},{"n":"wheel_front_90","t":{"a":1.06,"b":0.19,"c":-0.19,"d":1.06,"tx":300.8,"ty":263.4}}],[{"n":"top_90","t":{"a":-0.88,"b":-0.48,"c":-0.48,"d":0.88,"tx":178.95,"ty":186.8}},{"n":"hair_back_90","t":{"a":-0.88,"b":-0.48,"c":-0.48,"d":0.88,"tx":192.75,"ty":162.45}},{"n":"head_90","t":{"a":-0.88,"b":-0.48,"c":-0.48,"d":0.88,"tx":193.2,"ty":163.8}},{"n":"eyes_90","t":{"a":-0.88,"b":-0.48,"c":-0.48,"d":0.88,"tx":193.2,"ty":163.8}},{"n":"mouth_90","t":{"a":-0.88,"b":-0.48,"c":-0.48,"d":0.88,"tx":193.2,"ty":163.8}},{"n":"hair_90","t":{"a":-0.88,"b":-0.48,"c":-0.48,"d":0.88,"tx":192.75,"ty":162.45}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.95,"b":-0.3,"c":-0.3,"d":0.95,"tx":178.9,"ty":186.45}},{"n":"hair_back_90","t":{"a":-0.95,"b":-0.3,"c":-0.3,"d":0.95,"tx":187.5,"ty":160.9}},{"n":"head_90","t":{"a":-0.95,"b":-0.3,"c":-0.3,"d":0.95,"tx":188.2,"ty":162.1}},{"n":"eyes_90","t":{"a":-0.95,"b":-0.3,"c":-0.3,"d":0.95,"tx":188.2,"ty":162.1}},{"n":"mouth_90","t":{"a":-0.95,"b":-0.3,"c":-0.3,"d":0.95,"tx":188.2,"ty":162.1}},{"n":"hair_90","t":{"a":-0.95,"b":-0.3,"c":-0.3,"d":0.95,"tx":187.5,"ty":160.9}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":-0.11,"c":-0.11,"d":0.99,"tx":178.8,"ty":186.1}},{"n":"hair_back_90","t":{"a":-0.99,"b":-0.11,"c":-0.11,"d":0.99,"tx":182.35,"ty":159.4}},{"n":"head_90","t":{"a":-0.99,"b":-0.11,"c":-0.11,"d":0.99,"tx":183.2,"ty":160.45}},{"n":"eyes_90","t":{"a":-0.99,"b":-0.11,"c":-0.11,"d":0.99,"tx":183.2,"ty":160.45}},{"n":"mouth_90","t":{"a":-0.99,"b":-0.11,"c":-0.11,"d":0.99,"tx":183.2,"ty":160.45}},{"n":"hair_90","t":{"a":-0.99,"b":-0.11,"c":-0.11,"d":0.99,"tx":182.35,"ty":159.4}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":178.75,"ty":185.65}},{"n":"hair_back_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":177.2,"ty":157.9}},{"n":"head_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":178.3,"ty":158.8}},{"n":"eyes_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":178.3,"ty":158.8}},{"n":"mouth_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":178.3,"ty":158.8}},{"n":"hair_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":177.2,"ty":157.9}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":185.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.03,"c":-0.03,"d":1,"tx":178.05,"ty":185.6}},{"n":"hair_back_90","t":{"a":-1,"b":-0.03,"c":-0.03,"d":1,"tx":179.4,"ty":157.65}},{"n":"head_90","t":{"a":-1,"b":-0.03,"c":-0.03,"d":1,"tx":180.35,"ty":158.7}},{"n":"eyes_90","t":{"a":-1,"b":-0.03,"c":-0.03,"d":1,"tx":180.35,"ty":158.7}},{"n":"mouth_90","t":{"a":-1,"b":-0.03,"c":-0.03,"d":1,"tx":180.35,"ty":158.7}},{"n":"hair_90","t":{"a":-1,"b":-0.03,"c":-0.03,"d":1,"tx":179.4,"ty":157.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.05,"c":-0.05,"d":1,"tx":177.8,"ty":185.55}},{"n":"hair_back_90","t":{"a":-1,"b":-0.05,"c":-0.05,"d":1,"tx":179.6,"ty":157.65}},{"n":"head_90","t":{"a":-1,"b":-0.05,"c":-0.05,"d":1,"tx":180.55,"ty":158.75}},{"n":"eyes_90","t":{"a":-1,"b":-0.05,"c":-0.05,"d":1,"tx":180.55,"ty":158.75}},{"n":"mouth_90","t":{"a":-1,"b":-0.05,"c":-0.05,"d":1,"tx":180.55,"ty":158.75}},{"n":"hair_90","t":{"a":-1,"b":-0.05,"c":-0.05,"d":1,"tx":179.6,"ty":157.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.02,"c":-0.02,"d":1,"tx":178.15,"ty":185.6}},{"n":"hair_back_90","t":{"a":-1,"b":-0.02,"c":-0.02,"d":1,"tx":179.3,"ty":157.6}},{"n":"head_90","t":{"a":-1,"b":-0.02,"c":-0.02,"d":1,"tx":180.35,"ty":158.7}},{"n":"eyes_90","t":{"a":-1,"b":-0.02,"c":-0.02,"d":1,"tx":180.35,"ty":158.7}},{"n":"mouth_90","t":{"a":-1,"b":-0.02,"c":-0.02,"d":1,"tx":180.35,"ty":158.7}},{"n":"hair_90","t":{"a":-1,"b":-0.02,"c":-0.02,"d":1,"tx":179.3,"ty":157.6}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":185.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}]],"walk_90_next":["loop"],"rocking_90_next":["loop"],"idle_90":[[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":185.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":183.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":1.01,"tx":180.35,"ty":254.8}},{"n":"decal_90","t":{"a":-1.18,"b":0,"c":0,"d":1.22,"tx":205.3,"ty":258.25}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":181.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":153.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":154.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":154.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":154.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":153.65}},{"n":"chassis_90","t":{"a":-0.97,"b":0,"c":0,"d":1.03,"tx":180.6,"ty":254.5}},{"n":"decal_90","t":{"a":-1.16,"b":0,"c":0,"d":1.24,"tx":205.6,"ty":257.9}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":179.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":151.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":152.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":152.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":152.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":151.65}},{"n":"chassis_90","t":{"a":-0.95,"b":0,"c":0,"d":1.04,"tx":180.8,"ty":254.25}},{"n":"decal_90","t":{"a":-1.15,"b":0,"c":0,"d":1.25,"tx":205.85,"ty":257.65}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":177.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":149.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":150.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":150.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":150.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":149.65}},{"n":"chassis_90","t":{"a":-0.94,"b":0,"c":0,"d":1.06,"tx":181.05,"ty":253.95}},{"n":"decal_90","t":{"a":-1.13,"b":0,"c":0,"d":1.27,"tx":206.15,"ty":257.25}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":179.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":151.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":152.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":152.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":152.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":151.65}},{"n":"chassis_90","t":{"a":-0.95,"b":0,"c":0,"d":1.04,"tx":180.8,"ty":254.25}},{"n":"decal_90","t":{"a":-1.15,"b":0,"c":0,"d":1.25,"tx":205.85,"ty":257.6}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":181.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":153.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":154.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":154.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":154.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":153.65}},{"n":"chassis_90","t":{"a":-0.97,"b":0,"c":0,"d":1.03,"tx":180.65,"ty":254.5}},{"n":"decal_90","t":{"a":-1.16,"b":0,"c":0,"d":1.24,"tx":205.65,"ty":257.9}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":183.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":1.01,"tx":180.35,"ty":254.8}},{"n":"decal_90","t":{"a":-1.18,"b":0,"c":0,"d":1.22,"tx":205.3,"ty":258.25}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":185.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":183.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"eyes_90","a":0,"t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":155.15}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":1.01,"tx":180.35,"ty":254.8}},{"n":"decal_90","t":{"a":-1.18,"b":0,"c":0,"d":1.22,"tx":205.3,"ty":258.25}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":181.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":153.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":154.65}},{"n":"eyes_90","a":0,"t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":155.15}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":154.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":153.65}},{"n":"chassis_90","t":{"a":-0.97,"b":0,"c":0,"d":1.03,"tx":180.6,"ty":254.5}},{"n":"decal_90","t":{"a":-1.16,"b":0,"c":0,"d":1.24,"tx":205.6,"ty":257.9}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":179.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":151.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":152.65}},{"n":"eyes_90","a":0,"t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":155.15}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":152.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":151.65}},{"n":"chassis_90","t":{"a":-0.95,"b":0,"c":0,"d":1.04,"tx":180.8,"ty":254.25}},{"n":"decal_90","t":{"a":-1.15,"b":0,"c":0,"d":1.25,"tx":205.85,"ty":257.65}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":177.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":149.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":150.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":150.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":150.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":149.65}},{"n":"chassis_90","t":{"a":-0.94,"b":0,"c":0,"d":1.06,"tx":181.05,"ty":253.95}},{"n":"decal_90","t":{"a":-1.13,"b":0,"c":0,"d":1.27,"tx":206.15,"ty":257.25}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":179.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":151.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":152.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":152.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":152.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":151.65}},{"n":"chassis_90","t":{"a":-0.95,"b":0,"c":0,"d":1.04,"tx":180.8,"ty":254.25}},{"n":"decal_90","t":{"a":-1.15,"b":0,"c":0,"d":1.25,"tx":205.85,"ty":257.6}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":181.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":153.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":154.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":154.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":154.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":153.65}},{"n":"chassis_90","t":{"a":-0.97,"b":0,"c":0,"d":1.03,"tx":180.65,"ty":254.5}},{"n":"decal_90","t":{"a":-1.16,"b":0,"c":0,"d":1.24,"tx":205.65,"ty":257.9}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":183.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":1.01,"tx":180.35,"ty":254.8}},{"n":"decal_90","t":{"a":-1.18,"b":0,"c":0,"d":1.22,"tx":205.3,"ty":258.25}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":185.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}]],"rocking_90":[[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.1,"ty":186.1}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.65,"ty":158.1}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179.65,"ty":159.1}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179.65,"ty":159.1}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179.65,"ty":159.1}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.65,"ty":158.1}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.05,"ty":255.45}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":204.95,"ty":258.85}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":177.15,"ty":187.4}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":177.6,"ty":159.4}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.6,"ty":160.4}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.6,"ty":160.4}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.6,"ty":160.4}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":177.6,"ty":159.4}},{"n":"chassis_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":179.95,"ty":256.7}},{"n":"decal_90","t":{"a":-1.2,"b":0.02,"c":0.02,"d":1.2,"tx":204.85,"ty":259.8}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":175.5,"ty":189.55}},{"n":"hair_back_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":175.85,"ty":161.55}},{"n":"head_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":176.85,"ty":162.55}},{"n":"eyes_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":176.85,"ty":162.55}},{"n":"mouth_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":176.85,"ty":162.55}},{"n":"hair_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":175.85,"ty":161.55}},{"n":"chassis_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":179.7,"ty":258.75}},{"n":"decal_90","t":{"a":-1.2,"b":0.04,"c":0.04,"d":1.2,"tx":204.7,"ty":261.4}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":173.2,"ty":192.6}},{"n":"hair_back_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":173.35,"ty":164.6}},{"n":"head_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":174.4,"ty":165.6}},{"n":"eyes_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":174.4,"ty":165.6}},{"n":"mouth_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":174.4,"ty":165.6}},{"n":"hair_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":173.35,"ty":164.6}},{"n":"chassis_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":179.4,"ty":261.6}},{"n":"decal_90","t":{"a":-1.2,"b":0.07,"c":0.07,"d":1.2,"tx":204.4,"ty":263.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.02,"c":0.02,"d":1,"tx":170.25,"ty":196.5}},{"n":"hair_back_90","t":{"a":-1,"b":0.02,"c":0.02,"d":1,"tx":170.2,"ty":168.5}},{"n":"head_90","t":{"a":-1,"b":0.02,"c":0.02,"d":1,"tx":171.2,"ty":169.5}},{"n":"eyes_90","t":{"a":-1,"b":0.02,"c":0.02,"d":1,"tx":171.2,"ty":169.5}},{"n":"mouth_90","t":{"a":-1,"b":0.02,"c":0.02,"d":1,"tx":171.2,"ty":169.5}},{"n":"hair_90","t":{"a":-1,"b":0.02,"c":0.02,"d":1,"tx":170.2,"ty":168.5}},{"n":"chassis_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":179,"ty":265.25}},{"n":"decal_90","t":{"a":-1.19,"b":0.11,"c":0.11,"d":1.19,"tx":204.1,"ty":266.4}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.65,"ty":201.25}},{"n":"hair_back_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.3,"ty":173.3}},{"n":"head_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"eyes_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"mouth_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"hair_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.3,"ty":173.3}},{"n":"chassis_90","t":{"a":-0.99,"b":0.13,"c":0.13,"d":0.99,"tx":178.55,"ty":269.75}},{"n":"decal_90","t":{"a":-1.19,"b":0.16,"c":0.16,"d":1.19,"tx":203.7,"ty":269.85}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.05,"ty":197.6}},{"n":"hair_back_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":164,"ty":169.7}},{"n":"head_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.1,"ty":170.65}},{"n":"eyes_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.1,"ty":170.65}},{"n":"mouth_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.1,"ty":170.65}},{"n":"hair_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":164,"ty":169.7}},{"n":"chassis_90","t":{"a":-0.99,"b":0.16,"c":0.16,"d":0.99,"tx":178.5,"ty":262.65}},{"n":"decal_90","t":{"a":-1.18,"b":0.19,"c":0.19,"d":1.18,"tx":203.7,"ty":262.15}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.65,"ty":194.55}},{"n":"hair_back_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":162.05,"ty":166.75}},{"n":"head_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.2,"ty":167.6}},{"n":"eyes_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.2,"ty":167.6}},{"n":"mouth_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.2,"ty":167.6}},{"n":"hair_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":162.05,"ty":166.75}},{"n":"chassis_90","t":{"a":-0.98,"b":0.17,"c":0.17,"d":0.98,"tx":178.45,"ty":256.9}},{"n":"decal_90","t":{"a":-1.18,"b":0.21,"c":0.21,"d":1.18,"tx":203.6,"ty":255.95}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":162.6,"ty":192.2}},{"n":"hair_back_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":160.55,"ty":164.35}},{"n":"head_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":161.75,"ty":165.2}},{"n":"eyes_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":161.75,"ty":165.2}},{"n":"mouth_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":161.75,"ty":165.2}},{"n":"hair_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":160.55,"ty":164.35}},{"n":"chassis_90","t":{"a":-0.98,"b":0.19,"c":0.19,"d":0.98,"tx":178.5,"ty":252.4}},{"n":"decal_90","t":{"a":-1.18,"b":0.23,"c":0.23,"d":1.18,"tx":203.55,"ty":251.05}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":161.85,"ty":190.55}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":159.5,"ty":162.7}},{"n":"head_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.65,"ty":163.55}},{"n":"eyes_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.65,"ty":163.55}},{"n":"mouth_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.65,"ty":163.55}},{"n":"hair_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":159.5,"ty":162.7}},{"n":"chassis_90","t":{"a":-0.98,"b":0.2,"c":0.2,"d":0.98,"tx":178.45,"ty":249.1}},{"n":"decal_90","t":{"a":-1.17,"b":0.24,"c":0.24,"d":1.17,"tx":203.5,"ty":247.45}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":161.4,"ty":189.55}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.9,"ty":161.75}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":160.05,"ty":162.55}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":160.05,"ty":162.55}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":160.05,"ty":162.55}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.9,"ty":161.75}},{"n":"chassis_90","t":{"a":-0.98,"b":0.21,"c":0.21,"d":0.98,"tx":178.45,"ty":247.25}},{"n":"decal_90","t":{"a":-1.17,"b":0.25,"c":0.25,"d":1.17,"tx":203.55,"ty":245.4}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":161.2,"ty":189.25}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.65,"ty":161.4}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":159.8,"ty":162.25}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":159.8,"ty":162.25}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":159.8,"ty":162.25}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.65,"ty":161.4}},{"n":"chassis_90","t":{"a":-0.98,"b":0.21,"c":0.21,"d":0.98,"tx":178.4,"ty":246.6}},{"n":"decal_90","t":{"a":-1.17,"b":0.25,"c":0.25,"d":1.17,"tx":203.5,"ty":244.7}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":161.3,"ty":189.6}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.9,"ty":161.75}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":160.05,"ty":162.6}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":160.05,"ty":162.6}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":160.05,"ty":162.6}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.9,"ty":161.75}},{"n":"chassis_90","t":{"a":-0.98,"b":0.21,"c":0.21,"d":0.98,"tx":178.35,"ty":247.25}},{"n":"decal_90","t":{"a":-1.17,"b":0.25,"c":0.25,"d":1.17,"tx":203.5,"ty":245.45}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":161.8,"ty":190.6}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":159.5,"ty":162.7}},{"n":"head_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.65,"ty":163.6}},{"n":"eyes_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.65,"ty":163.6}},{"n":"mouth_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.65,"ty":163.6}},{"n":"hair_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":159.5,"ty":162.7}},{"n":"chassis_90","t":{"a":-0.98,"b":0.2,"c":0.2,"d":0.98,"tx":178.35,"ty":249.1}},{"n":"decal_90","t":{"a":-1.17,"b":0.24,"c":0.24,"d":1.17,"tx":203.55,"ty":247.45}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":162.55,"ty":192.25}},{"n":"hair_back_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":160.55,"ty":164.4}},{"n":"head_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":161.7,"ty":165.25}},{"n":"eyes_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":161.7,"ty":165.25}},{"n":"mouth_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":161.7,"ty":165.25}},{"n":"hair_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":160.55,"ty":164.4}},{"n":"chassis_90","t":{"a":-0.98,"b":0.19,"c":0.19,"d":0.98,"tx":178.45,"ty":252.35}},{"n":"decal_90","t":{"a":-1.18,"b":0.23,"c":0.23,"d":1.18,"tx":203.55,"ty":251}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.55,"ty":194.55}},{"n":"hair_back_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":162,"ty":166.7}},{"n":"head_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.15,"ty":167.65}},{"n":"eyes_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.15,"ty":167.65}},{"n":"mouth_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.15,"ty":167.65}},{"n":"hair_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":162,"ty":166.7}},{"n":"chassis_90","t":{"a":-0.98,"b":0.17,"c":0.17,"d":0.98,"tx":178.4,"ty":256.95}},{"n":"decal_90","t":{"a":-1.18,"b":0.21,"c":0.21,"d":1.18,"tx":203.6,"ty":255.95}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":164.95,"ty":197.6}},{"n":"hair_back_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":163.9,"ty":169.65}},{"n":"head_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165,"ty":170.6}},{"n":"eyes_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165,"ty":170.6}},{"n":"mouth_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165,"ty":170.6}},{"n":"hair_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":163.9,"ty":169.65}},{"n":"chassis_90","t":{"a":-0.99,"b":0.16,"c":0.16,"d":0.99,"tx":178.5,"ty":262.7}},{"n":"decal_90","t":{"a":-1.18,"b":0.19,"c":0.19,"d":1.18,"tx":203.65,"ty":262.15}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.65,"ty":201.25}},{"n":"hair_back_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.3,"ty":173.3}},{"n":"head_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"eyes_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"mouth_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"hair_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.3,"ty":173.3}},{"n":"chassis_90","t":{"a":-0.99,"b":0.13,"c":0.13,"d":0.99,"tx":178.55,"ty":269.75}},{"n":"decal_90","t":{"a":-1.19,"b":0.16,"c":0.16,"d":1.19,"tx":203.7,"ty":269.85}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":172.1,"ty":195.85}},{"n":"hair_back_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":174.35,"ty":167.25}},{"n":"head_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":175.45,"ty":168.2}},{"n":"eyes_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":175.45,"ty":168.2}},{"n":"mouth_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":175.45,"ty":168.2}},{"n":"hair_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":174.35,"ty":167.25}},{"n":"chassis_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":179.4,"ty":261.25}},{"n":"decal_90","t":{"a":-1.2,"b":0.07,"c":0.07,"d":1.2,"tx":204.35,"ty":263.15}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.1,"c":-0.1,"d":1,"tx":176.6,"ty":191.4}},{"n":"hair_back_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":180.95,"ty":162.35}},{"n":"head_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":182.1,"ty":163.3}},{"n":"eyes_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":182.1,"ty":163.3}},{"n":"mouth_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":182.1,"ty":163.3}},{"n":"hair_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":180.95,"ty":162.35}},{"n":"chassis_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":180.1,"ty":254.3}},{"n":"decal_90","t":{"a":-1.2,"b":0.01,"c":0.01,"d":1.2,"tx":204.85,"ty":257.65}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":-0.14,"c":-0.14,"d":0.99,"tx":180.05,"ty":188}},{"n":"hair_back_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":186.1,"ty":158.55}},{"n":"head_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":187.25,"ty":159.45}},{"n":"eyes_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":187.25,"ty":159.45}},{"n":"mouth_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":187.25,"ty":159.45}},{"n":"hair_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":186.1,"ty":158.55}},{"n":"chassis_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":180.6,"ty":248.9}},{"n":"decal_90","t":{"a":-1.2,"b":-0.04,"c":-0.04,"d":1.2,"tx":205.3,"ty":253.35}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.98,"b":-0.17,"c":-0.17,"d":0.98,"tx":182.5,"ty":185.55}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":189.75,"ty":155.8}},{"n":"head_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":190.9,"ty":156.65}},{"n":"eyes_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":190.9,"ty":156.65}},{"n":"mouth_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":190.9,"ty":156.65}},{"n":"hair_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":189.75,"ty":155.8}},{"n":"chassis_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":181,"ty":245.1}},{"n":"decal_90","t":{"a":-1.2,"b":-0.08,"c":-0.08,"d":1.2,"tx":205.55,"ty":250.25}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.98,"b":-0.19,"c":-0.19,"d":0.98,"tx":184,"ty":184.15}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":192,"ty":154.15}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.1,"ty":155.05}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.1,"ty":155.05}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.1,"ty":155.05}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":192,"ty":154.15}},{"n":"chassis_90","t":{"a":-1,"b":-0.09,"c":-0.09,"d":1,"tx":181.25,"ty":242.75}},{"n":"decal_90","t":{"a":-1.2,"b":-0.11,"c":-0.11,"d":1.2,"tx":205.75,"ty":248.45}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.98,"b":-0.2,"c":-0.2,"d":0.98,"tx":184.45,"ty":183.6}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":192.7,"ty":153.6}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.8,"ty":154.5}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.8,"ty":154.5}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.8,"ty":154.5}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":192.7,"ty":153.6}},{"n":"chassis_90","t":{"a":-1,"b":-0.09,"c":-0.09,"d":1,"tx":181.3,"ty":242}},{"n":"decal_90","t":{"a":-1.19,"b":-0.11,"c":-0.11,"d":1.19,"tx":205.8,"ty":247.85}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.98,"b":-0.19,"c":-0.19,"d":0.98,"tx":184,"ty":184.15}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":191.95,"ty":154.15}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.05,"ty":155.05}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.05,"ty":155.05}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.05,"ty":155.05}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":191.95,"ty":154.15}},{"n":"chassis_90","t":{"a":-1,"b":-0.09,"c":-0.09,"d":1,"tx":181.2,"ty":242.75}},{"n":"decal_90","t":{"a":-1.2,"b":-0.1,"c":-0.1,"d":1.2,"tx":205.75,"ty":248.45}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.98,"b":-0.17,"c":-0.17,"d":0.98,"tx":182.5,"ty":185.6}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":189.8,"ty":155.75}},{"n":"head_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":190.85,"ty":156.65}},{"n":"eyes_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":190.85,"ty":156.65}},{"n":"mouth_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":190.85,"ty":156.65}},{"n":"hair_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":189.8,"ty":155.75}},{"n":"chassis_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":181,"ty":245.15}},{"n":"decal_90","t":{"a":-1.2,"b":-0.08,"c":-0.08,"d":1.2,"tx":205.5,"ty":250.35}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":-0.14,"c":-0.14,"d":0.99,"tx":180.05,"ty":188}},{"n":"hair_back_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":186.15,"ty":158.5}},{"n":"head_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":187.2,"ty":159.4}},{"n":"eyes_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":187.2,"ty":159.4}},{"n":"mouth_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":187.2,"ty":159.4}},{"n":"hair_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":186.15,"ty":158.5}},{"n":"chassis_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":180.55,"ty":248.95}},{"n":"decal_90","t":{"a":-1.2,"b":-0.04,"c":-0.04,"d":1.2,"tx":205.2,"ty":253.4}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.1,"c":-0.1,"d":1,"tx":176.55,"ty":191.4}},{"n":"hair_back_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":181,"ty":162.35}},{"n":"head_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":182.05,"ty":163.25}},{"n":"eyes_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":182.05,"ty":163.25}},{"n":"mouth_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":182.05,"ty":163.25}},{"n":"hair_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":181,"ty":162.35}},{"n":"chassis_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":180.1,"ty":254.4}},{"n":"decal_90","t":{"a":-1.2,"b":0.01,"c":0.01,"d":1.2,"tx":204.8,"ty":257.65}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":172.1,"ty":195.85}},{"n":"hair_back_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":174.4,"ty":167.25}},{"n":"head_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":175.5,"ty":168.1}},{"n":"eyes_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":175.5,"ty":168.1}},{"n":"mouth_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":175.5,"ty":168.1}},{"n":"hair_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":174.4,"ty":167.25}},{"n":"chassis_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":179.45,"ty":261.3}},{"n":"decal_90","t":{"a":-1.2,"b":0.07,"c":0.07,"d":1.2,"tx":204.35,"ty":263.15}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.65,"ty":201.25}},{"n":"hair_back_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.3,"ty":173.3}},{"n":"head_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"eyes_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"mouth_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"hair_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.3,"ty":173.3}},{"n":"chassis_90","t":{"a":-0.99,"b":0.13,"c":0.13,"d":0.99,"tx":178.55,"ty":269.75}},{"n":"decal_90","t":{"a":-1.19,"b":0.16,"c":0.16,"d":1.19,"tx":203.7,"ty":269.85}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.05,"ty":197.6}},{"n":"hair_back_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":164,"ty":169.7}},{"n":"head_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.1,"ty":170.65}},{"n":"eyes_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.1,"ty":170.65}},{"n":"mouth_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.1,"ty":170.65}},{"n":"hair_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":164,"ty":169.7}},{"n":"chassis_90","t":{"a":-0.99,"b":0.16,"c":0.16,"d":0.99,"tx":178.5,"ty":262.65}},{"n":"decal_90","t":{"a":-1.18,"b":0.19,"c":0.19,"d":1.18,"tx":203.7,"ty":262.15}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.65,"ty":194.55}},{"n":"hair_back_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":162.05,"ty":166.75}},{"n":"head_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.2,"ty":167.6}},{"n":"eyes_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.2,"ty":167.6}},{"n":"mouth_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.2,"ty":167.6}},{"n":"hair_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":162.05,"ty":166.75}},{"n":"chassis_90","t":{"a":-0.98,"b":0.17,"c":0.17,"d":0.98,"tx":178.45,"ty":256.9}},{"n":"decal_90","t":{"a":-1.18,"b":0.21,"c":0.21,"d":1.18,"tx":203.6,"ty":255.95}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":162.6,"ty":192.2}},{"n":"hair_back_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":160.55,"ty":164.35}},{"n":"head_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":161.75,"ty":165.2}},{"n":"eyes_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":161.75,"ty":165.2}},{"n":"mouth_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":161.75,"ty":165.2}},{"n":"hair_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":160.55,"ty":164.35}},{"n":"chassis_90","t":{"a":-0.98,"b":0.19,"c":0.19,"d":0.98,"tx":178.5,"ty":252.4}},{"n":"decal_90","t":{"a":-1.18,"b":0.23,"c":0.23,"d":1.18,"tx":203.55,"ty":251.05}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":161.85,"ty":190.55}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":159.5,"ty":162.7}},{"n":"head_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.65,"ty":163.55}},{"n":"eyes_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.65,"ty":163.55}},{"n":"mouth_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.65,"ty":163.55}},{"n":"hair_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":159.5,"ty":162.7}},{"n":"chassis_90","t":{"a":-0.98,"b":0.2,"c":0.2,"d":0.98,"tx":178.45,"ty":249.1}},{"n":"decal_90","t":{"a":-1.17,"b":0.24,"c":0.24,"d":1.17,"tx":203.5,"ty":247.45}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":161.4,"ty":189.55}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.9,"ty":161.75}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":160.05,"ty":162.55}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":160.05,"ty":162.55}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":160.05,"ty":162.55}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.9,"ty":161.75}},{"n":"chassis_90","t":{"a":-0.98,"b":0.21,"c":0.21,"d":0.98,"tx":178.45,"ty":247.25}},{"n":"decal_90","t":{"a":-1.17,"b":0.25,"c":0.25,"d":1.17,"tx":203.55,"ty":245.4}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":161.2,"ty":189.25}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.65,"ty":161.4}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":159.8,"ty":162.25}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":159.8,"ty":162.25}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":159.8,"ty":162.25}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.65,"ty":161.4}},{"n":"chassis_90","t":{"a":-0.98,"b":0.21,"c":0.21,"d":0.98,"tx":178.4,"ty":246.6}},{"n":"decal_90","t":{"a":-1.17,"b":0.25,"c":0.25,"d":1.17,"tx":203.5,"ty":244.7}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":161.35,"ty":189.5}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.8,"ty":161.65}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":159.95,"ty":162.5}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":159.95,"ty":162.5}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":159.95,"ty":162.5}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.8,"ty":161.65}},{"n":"chassis_90","t":{"a":-0.98,"b":0.21,"c":0.21,"d":0.98,"tx":178.4,"ty":247.05}},{"n":"decal_90","t":{"a":-1.17,"b":0.25,"c":0.25,"d":1.17,"tx":203.5,"ty":245.2}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":161.65,"ty":190.25}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":159.25,"ty":162.35}},{"n":"head_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.4,"ty":163.25}},{"n":"eyes_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.4,"ty":163.25}},{"n":"mouth_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.4,"ty":163.25}},{"n":"hair_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":159.25,"ty":162.35}},{"n":"chassis_90","t":{"a":-0.98,"b":0.2,"c":0.2,"d":0.98,"tx":178.35,"ty":248.45}},{"n":"decal_90","t":{"a":-1.17,"b":0.24,"c":0.24,"d":1.17,"tx":203.5,"ty":246.75}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":162.25,"ty":191.45}},{"n":"hair_back_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":160.1,"ty":163.6}},{"n":"head_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":161.25,"ty":164.45}},{"n":"eyes_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":161.25,"ty":164.45}},{"n":"mouth_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":161.25,"ty":164.45}},{"n":"hair_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":160.1,"ty":163.6}},{"n":"chassis_90","t":{"a":-0.98,"b":0.2,"c":0.2,"d":0.98,"tx":178.45,"ty":250.8}},{"n":"decal_90","t":{"a":-1.18,"b":0.23,"c":0.23,"d":1.18,"tx":203.55,"ty":249.3}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":162.95,"ty":193.15}},{"n":"hair_back_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":161.15,"ty":165.3}},{"n":"head_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":162.25,"ty":166.1}},{"n":"eyes_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":162.25,"ty":166.1}},{"n":"mouth_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":162.25,"ty":166.1}},{"n":"hair_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":161.15,"ty":165.3}},{"n":"chassis_90","t":{"a":-0.98,"b":0.19,"c":0.19,"d":0.98,"tx":178.45,"ty":254.1}},{"n":"decal_90","t":{"a":-1.18,"b":0.22,"c":0.22,"d":1.18,"tx":203.55,"ty":252.9}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":164,"ty":195.35}},{"n":"hair_back_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":162.55,"ty":167.45}},{"n":"head_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.6,"ty":168.35}},{"n":"eyes_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.6,"ty":168.35}},{"n":"mouth_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.6,"ty":168.35}},{"n":"hair_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":162.55,"ty":167.45}},{"n":"chassis_90","t":{"a":-0.98,"b":0.17,"c":0.17,"d":0.98,"tx":178.45,"ty":258.4}},{"n":"decal_90","t":{"a":-1.18,"b":0.2,"c":0.2,"d":1.18,"tx":203.6,"ty":257.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.2,"ty":198.05}},{"n":"hair_back_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":164.3,"ty":170.15}},{"n":"head_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.4,"ty":171.05}},{"n":"eyes_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.4,"ty":171.05}},{"n":"mouth_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.4,"ty":171.05}},{"n":"hair_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":164.3,"ty":170.15}},{"n":"chassis_90","t":{"a":-0.99,"b":0.15,"c":0.15,"d":0.99,"tx":178.45,"ty":263.6}},{"n":"decal_90","t":{"a":-1.19,"b":0.18,"c":0.18,"d":1.19,"tx":203.65,"ty":263.2}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.65,"ty":201.25}},{"n":"hair_back_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.3,"ty":173.3}},{"n":"head_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"eyes_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"mouth_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"hair_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.3,"ty":173.3}},{"n":"chassis_90","t":{"a":-0.99,"b":0.13,"c":0.13,"d":0.99,"tx":178.55,"ty":269.75}},{"n":"decal_90","t":{"a":-1.19,"b":0.16,"c":0.16,"d":1.19,"tx":203.7,"ty":269.85}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":172.1,"ty":195.85}},{"n":"hair_back_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":174.35,"ty":167.25}},{"n":"head_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":175.45,"ty":168.2}},{"n":"eyes_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":175.45,"ty":168.2}},{"n":"mouth_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":175.45,"ty":168.2}},{"n":"hair_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":174.35,"ty":167.25}},{"n":"chassis_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":179.4,"ty":261.25}},{"n":"decal_90","t":{"a":-1.2,"b":0.07,"c":0.07,"d":1.2,"tx":204.35,"ty":263.15}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.1,"c":-0.1,"d":1,"tx":176.6,"ty":191.4}},{"n":"hair_back_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":180.95,"ty":162.35}},{"n":"head_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":182.1,"ty":163.3}},{"n":"eyes_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":182.1,"ty":163.3}},{"n":"mouth_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":182.1,"ty":163.3}},{"n":"hair_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":180.95,"ty":162.35}},{"n":"chassis_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":180.1,"ty":254.3}},{"n":"decal_90","t":{"a":-1.2,"b":0.01,"c":0.01,"d":1.2,"tx":204.85,"ty":257.65}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":-0.14,"c":-0.14,"d":0.99,"tx":180.05,"ty":188}},{"n":"hair_back_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":186.1,"ty":158.55}},{"n":"head_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":187.25,"ty":159.45}},{"n":"eyes_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":187.25,"ty":159.45}},{"n":"mouth_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":187.25,"ty":159.45}},{"n":"hair_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":186.1,"ty":158.55}},{"n":"chassis_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":180.6,"ty":248.9}},{"n":"decal_90","t":{"a":-1.2,"b":-0.04,"c":-0.04,"d":1.2,"tx":205.3,"ty":253.35}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.98,"b":-0.17,"c":-0.17,"d":0.98,"tx":182.5,"ty":185.55}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":189.75,"ty":155.8}},{"n":"head_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":190.9,"ty":156.65}},{"n":"eyes_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":190.9,"ty":156.65}},{"n":"mouth_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":190.9,"ty":156.65}},{"n":"hair_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":189.75,"ty":155.8}},{"n":"chassis_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":181,"ty":245.1}},{"n":"decal_90","t":{"a":-1.2,"b":-0.08,"c":-0.08,"d":1.2,"tx":205.55,"ty":250.25}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.98,"b":-0.19,"c":-0.19,"d":0.98,"tx":184,"ty":184.15}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":192,"ty":154.15}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.1,"ty":155.05}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.1,"ty":155.05}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.1,"ty":155.05}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":192,"ty":154.15}},{"n":"chassis_90","t":{"a":-1,"b":-0.09,"c":-0.09,"d":1,"tx":181.25,"ty":242.75}},{"n":"decal_90","t":{"a":-1.2,"b":-0.11,"c":-0.11,"d":1.2,"tx":205.75,"ty":248.45}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.98,"b":-0.2,"c":-0.2,"d":0.98,"tx":184.45,"ty":183.6}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":192.7,"ty":153.6}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.8,"ty":154.5}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.8,"ty":154.5}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.8,"ty":154.5}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":192.7,"ty":153.6}},{"n":"chassis_90","t":{"a":-1,"b":-0.09,"c":-0.09,"d":1,"tx":181.3,"ty":242}},{"n":"decal_90","t":{"a":-1.19,"b":-0.11,"c":-0.11,"d":1.19,"tx":205.8,"ty":247.85}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.98,"b":-0.19,"c":-0.19,"d":0.98,"tx":184,"ty":184.15}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":191.95,"ty":154.15}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.05,"ty":155.05}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.05,"ty":155.05}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.05,"ty":155.05}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":191.95,"ty":154.15}},{"n":"chassis_90","t":{"a":-1,"b":-0.09,"c":-0.09,"d":1,"tx":181.2,"ty":242.75}},{"n":"decal_90","t":{"a":-1.2,"b":-0.1,"c":-0.1,"d":1.2,"tx":205.75,"ty":248.45}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.98,"b":-0.17,"c":-0.17,"d":0.98,"tx":182.5,"ty":185.6}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":189.8,"ty":155.75}},{"n":"head_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":190.85,"ty":156.65}},{"n":"eyes_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":190.85,"ty":156.65}},{"n":"mouth_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":190.85,"ty":156.65}},{"n":"hair_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":189.8,"ty":155.75}},{"n":"chassis_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":181,"ty":245.15}},{"n":"decal_90","t":{"a":-1.2,"b":-0.08,"c":-0.08,"d":1.2,"tx":205.5,"ty":250.35}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":-0.14,"c":-0.14,"d":0.99,"tx":180.05,"ty":188}},{"n":"hair_back_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":186.15,"ty":158.5}},{"n":"head_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":187.2,"ty":159.4}},{"n":"eyes_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":187.2,"ty":159.4}},{"n":"mouth_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":187.2,"ty":159.4}},{"n":"hair_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":186.15,"ty":158.5}},{"n":"chassis_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":180.55,"ty":248.95}},{"n":"decal_90","t":{"a":-1.2,"b":-0.04,"c":-0.04,"d":1.2,"tx":205.2,"ty":253.4}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.1,"c":-0.1,"d":1,"tx":176.55,"ty":191.4}},{"n":"hair_back_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":181,"ty":162.35}},{"n":"head_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":182.05,"ty":163.25}},{"n":"eyes_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":182.05,"ty":163.25}},{"n":"mouth_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":182.05,"ty":163.25}},{"n":"hair_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":181,"ty":162.35}},{"n":"chassis_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":180.1,"ty":254.4}},{"n":"decal_90","t":{"a":-1.2,"b":0.01,"c":0.01,"d":1.2,"tx":204.8,"ty":257.65}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":172.1,"ty":195.85}},{"n":"hair_back_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":174.4,"ty":167.25}},{"n":"head_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":175.5,"ty":168.1}},{"n":"eyes_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":175.5,"ty":168.1}},{"n":"mouth_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":175.5,"ty":168.1}},{"n":"hair_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":174.4,"ty":167.25}},{"n":"chassis_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":179.45,"ty":261.3}},{"n":"decal_90","t":{"a":-1.2,"b":0.07,"c":0.07,"d":1.2,"tx":204.35,"ty":263.15}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.65,"ty":201.25}},{"n":"hair_back_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.3,"ty":173.3}},{"n":"head_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"eyes_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"mouth_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"hair_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.3,"ty":173.3}},{"n":"chassis_90","t":{"a":-0.99,"b":0.13,"c":0.13,"d":0.99,"tx":178.55,"ty":269.75}},{"n":"decal_90","t":{"a":-1.19,"b":0.16,"c":0.16,"d":1.19,"tx":203.7,"ty":269.85}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.05,"ty":197.6}},{"n":"hair_back_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":164,"ty":169.7}},{"n":"head_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.1,"ty":170.65}},{"n":"eyes_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.1,"ty":170.65}},{"n":"mouth_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":165.1,"ty":170.65}},{"n":"hair_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":164,"ty":169.7}},{"n":"chassis_90","t":{"a":-0.99,"b":0.16,"c":0.16,"d":0.99,"tx":178.5,"ty":262.65}},{"n":"decal_90","t":{"a":-1.18,"b":0.19,"c":0.19,"d":1.18,"tx":203.7,"ty":262.15}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.65,"ty":194.55}},{"n":"hair_back_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":162.05,"ty":166.75}},{"n":"head_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.2,"ty":167.6}},{"n":"eyes_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.2,"ty":167.6}},{"n":"mouth_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":163.2,"ty":167.6}},{"n":"hair_90","t":{"a":-1,"b":0.07,"c":0.07,"d":1,"tx":162.05,"ty":166.75}},{"n":"chassis_90","t":{"a":-0.98,"b":0.17,"c":0.17,"d":0.98,"tx":178.45,"ty":256.9}},{"n":"decal_90","t":{"a":-1.18,"b":0.21,"c":0.21,"d":1.18,"tx":203.6,"ty":255.95}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":162.6,"ty":192.2}},{"n":"hair_back_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":160.55,"ty":164.35}},{"n":"head_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":161.75,"ty":165.2}},{"n":"eyes_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":161.75,"ty":165.2}},{"n":"mouth_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":161.75,"ty":165.2}},{"n":"hair_90","t":{"a":-1,"b":0.09,"c":0.09,"d":1,"tx":160.55,"ty":164.35}},{"n":"chassis_90","t":{"a":-0.98,"b":0.19,"c":0.19,"d":0.98,"tx":178.5,"ty":252.4}},{"n":"decal_90","t":{"a":-1.18,"b":0.23,"c":0.23,"d":1.18,"tx":203.55,"ty":251.05}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":161.85,"ty":190.55}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":159.5,"ty":162.7}},{"n":"head_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.65,"ty":163.55}},{"n":"eyes_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.65,"ty":163.55}},{"n":"mouth_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.65,"ty":163.55}},{"n":"hair_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":159.5,"ty":162.7}},{"n":"chassis_90","t":{"a":-0.98,"b":0.2,"c":0.2,"d":0.98,"tx":178.45,"ty":249.1}},{"n":"decal_90","t":{"a":-1.17,"b":0.24,"c":0.24,"d":1.17,"tx":203.5,"ty":247.45}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":161.4,"ty":189.55}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.9,"ty":161.75}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":160.05,"ty":162.55}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":160.05,"ty":162.55}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":160.05,"ty":162.55}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.9,"ty":161.75}},{"n":"chassis_90","t":{"a":-0.98,"b":0.21,"c":0.21,"d":0.98,"tx":178.45,"ty":247.25}},{"n":"decal_90","t":{"a":-1.17,"b":0.25,"c":0.25,"d":1.17,"tx":203.55,"ty":245.4}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":161.2,"ty":189.25}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.65,"ty":161.4}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":159.8,"ty":162.25}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":159.8,"ty":162.25}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":159.8,"ty":162.25}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":158.65,"ty":161.4}},{"n":"chassis_90","t":{"a":-0.98,"b":0.21,"c":0.21,"d":0.98,"tx":178.4,"ty":246.6}},{"n":"decal_90","t":{"a":-1.17,"b":0.25,"c":0.25,"d":1.17,"tx":203.5,"ty":244.7}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":161.35,"ty":189.75}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":158.95,"ty":161.9}},{"n":"head_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.15,"ty":162.75}},{"n":"eyes_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.15,"ty":162.75}},{"n":"mouth_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":160.15,"ty":162.75}},{"n":"hair_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":158.95,"ty":161.9}},{"n":"chassis_90","t":{"a":-0.98,"b":0.21,"c":0.21,"d":0.98,"tx":178.35,"ty":247.55}},{"n":"decal_90","t":{"a":-1.17,"b":0.25,"c":0.25,"d":1.17,"tx":203.45,"ty":245.7}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.1,"c":0.1,"d":1,"tx":162.1,"ty":191.1}},{"n":"hair_back_90","t":{"a":-1,"b":0.1,"c":0.1,"d":1,"tx":159.85,"ty":163.3}},{"n":"head_90","t":{"a":-1,"b":0.1,"c":0.1,"d":1,"tx":161,"ty":164.15}},{"n":"eyes_90","t":{"a":-1,"b":0.1,"c":0.1,"d":1,"tx":161,"ty":164.15}},{"n":"mouth_90","t":{"a":-1,"b":0.1,"c":0.1,"d":1,"tx":161,"ty":164.15}},{"n":"hair_90","t":{"a":-1,"b":0.1,"c":0.1,"d":1,"tx":159.85,"ty":163.3}},{"n":"chassis_90","t":{"a":-0.98,"b":0.2,"c":0.2,"d":0.98,"tx":178.35,"ty":250.3}},{"n":"decal_90","t":{"a":-1.18,"b":0.24,"c":0.24,"d":1.18,"tx":203.55,"ty":248.65}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":163.1,"ty":193.55}},{"n":"hair_back_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":161.4,"ty":165.7}},{"n":"head_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":162.55,"ty":166.55}},{"n":"eyes_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":162.55,"ty":166.55}},{"n":"mouth_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":162.55,"ty":166.55}},{"n":"hair_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":161.4,"ty":165.7}},{"n":"chassis_90","t":{"a":-0.98,"b":0.18,"c":0.18,"d":0.98,"tx":178.4,"ty":254.9}},{"n":"decal_90","t":{"a":-1.18,"b":0.22,"c":0.22,"d":1.18,"tx":203.6,"ty":253.7}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":164.7,"ty":196.95}},{"n":"hair_back_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":163.55,"ty":169}},{"n":"head_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":164.65,"ty":170}},{"n":"eyes_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":164.65,"ty":170}},{"n":"mouth_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":164.65,"ty":170}},{"n":"hair_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":163.55,"ty":169}},{"n":"chassis_90","t":{"a":-0.99,"b":0.16,"c":0.16,"d":0.99,"tx":178.45,"ty":261.4}},{"n":"decal_90","t":{"a":-1.18,"b":0.19,"c":0.19,"d":1.18,"tx":203.65,"ty":260.8}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.65,"ty":201.25}},{"n":"hair_back_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.3,"ty":173.3}},{"n":"head_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"eyes_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"mouth_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":167.35,"ty":174.25}},{"n":"hair_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":166.3,"ty":173.3}},{"n":"chassis_90","t":{"a":-0.99,"b":0.13,"c":0.13,"d":0.99,"tx":178.55,"ty":269.75}},{"n":"decal_90","t":{"a":-1.19,"b":0.16,"c":0.16,"d":1.19,"tx":203.7,"ty":269.85}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.05,"c":-0.05,"d":1,"tx":173.1,"ty":194.9}},{"n":"hair_back_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":175.85,"ty":166.2}},{"n":"head_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":176.9,"ty":167.15}},{"n":"eyes_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":176.9,"ty":167.15}},{"n":"mouth_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":176.9,"ty":167.15}},{"n":"hair_90","t":{"a":-1,"b":0.06,"c":0.06,"d":1,"tx":175.85,"ty":166.2}},{"n":"chassis_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":179.55,"ty":259.75}},{"n":"decal_90","t":{"a":-1.2,"b":0.06,"c":0.06,"d":1.2,"tx":204.5,"ty":261.95}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":-0.11,"c":-0.11,"d":0.99,"tx":178.1,"ty":189.95}},{"n":"hair_back_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":183.25,"ty":160.65}},{"n":"head_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":184.35,"ty":161.55}},{"n":"eyes_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":184.35,"ty":161.55}},{"n":"mouth_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":184.35,"ty":161.55}},{"n":"hair_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":183.25,"ty":160.65}},{"n":"chassis_90","t":{"a":-1,"b":-0.01,"c":-0.01,"d":1,"tx":180.3,"ty":252}},{"n":"decal_90","t":{"a":-1.2,"b":-0.01,"c":-0.01,"d":1.2,"tx":205,"ty":255.7}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":-0.16,"c":-0.16,"d":0.99,"tx":181.6,"ty":186.4}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":188.5,"ty":156.75}},{"n":"head_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":189.55,"ty":157.65}},{"n":"eyes_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":189.55,"ty":157.65}},{"n":"mouth_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":189.55,"ty":157.65}},{"n":"hair_90","t":{"a":-0.99,"b":0.1,"c":0.1,"d":0.99,"tx":188.5,"ty":156.75}},{"n":"chassis_90","t":{"a":-1,"b":-0.06,"c":-0.06,"d":1,"tx":180.85,"ty":246.5}},{"n":"decal_90","t":{"a":-1.2,"b":-0.07,"c":-0.07,"d":1.2,"tx":205.4,"ty":251.4}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.98,"b":-0.19,"c":-0.19,"d":0.98,"tx":183.8,"ty":184.3}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":191.7,"ty":154.4}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":192.8,"ty":155.3}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":192.8,"ty":155.3}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":192.8,"ty":155.3}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":191.7,"ty":154.4}},{"n":"chassis_90","t":{"a":-1,"b":-0.08,"c":-0.08,"d":1,"tx":181.25,"ty":243.1}},{"n":"decal_90","t":{"a":-1.2,"b":-0.1,"c":-0.1,"d":1.2,"tx":205.65,"ty":248.8}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.98,"b":-0.2,"c":-0.2,"d":0.98,"tx":184.45,"ty":183.6}},{"n":"hair_back_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":192.7,"ty":153.6}},{"n":"head_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.8,"ty":154.5}},{"n":"eyes_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.8,"ty":154.5}},{"n":"mouth_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":193.8,"ty":154.5}},{"n":"hair_90","t":{"a":-0.99,"b":0.11,"c":0.11,"d":0.99,"tx":192.7,"ty":153.6}},{"n":"chassis_90","t":{"a":-1,"b":-0.09,"c":-0.09,"d":1,"tx":181.3,"ty":242}},{"n":"decal_90","t":{"a":-1.19,"b":-0.11,"c":-0.11,"d":1.19,"tx":205.8,"ty":247.85}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-0.99,"b":-0.14,"c":-0.14,"d":0.99,"tx":182.6,"ty":184.3}},{"n":"hair_back_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":188.55,"ty":154.85}},{"n":"head_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":189.65,"ty":155.75}},{"n":"eyes_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":189.65,"ty":155.75}},{"n":"mouth_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":189.65,"ty":155.75}},{"n":"hair_90","t":{"a":-1,"b":0.08,"c":0.08,"d":1,"tx":188.55,"ty":154.85}},{"n":"chassis_90","t":{"a":-1,"b":-0.07,"c":-0.07,"d":1,"tx":180.95,"ty":246.05}},{"n":"decal_90","t":{"a":-1.2,"b":-0.08,"c":-0.08,"d":1.2,"tx":205.55,"ty":251.15}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.09,"c":-0.09,"d":1,"tx":181.15,"ty":184.75}},{"n":"hair_back_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":185.15,"ty":155.9}},{"n":"head_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":186.15,"ty":156.75}},{"n":"eyes_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":186.15,"ty":156.75}},{"n":"mouth_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":186.15,"ty":156.75}},{"n":"hair_90","t":{"a":-1,"b":0.05,"c":0.05,"d":1,"tx":185.15,"ty":155.9}},{"n":"chassis_90","t":{"a":-1,"b":-0.04,"c":-0.04,"d":1,"tx":180.65,"ty":249.25}},{"n":"decal_90","t":{"a":-1.2,"b":-0.05,"c":-0.05,"d":1.2,"tx":205.3,"ty":253.8}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.05,"c":-0.05,"d":1,"tx":180,"ty":185.15}},{"n":"hair_back_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":182.5,"ty":156.65}},{"n":"head_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":183.5,"ty":157.6}},{"n":"eyes_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":183.5,"ty":157.6}},{"n":"mouth_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":183.5,"ty":157.6}},{"n":"hair_90","t":{"a":-1,"b":0.03,"c":0.03,"d":1,"tx":182.5,"ty":156.65}},{"n":"chassis_90","t":{"a":-1,"b":-0.02,"c":-0.02,"d":1,"tx":180.35,"ty":251.85}},{"n":"decal_90","t":{"a":-1.2,"b":-0.03,"c":-0.03,"d":1.2,"tx":205.2,"ty":255.9}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":-0.02,"c":-0.02,"d":1,"tx":179.1,"ty":185.4}},{"n":"hair_back_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":180.5,"ty":157.2}},{"n":"head_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":181.55,"ty":158.15}},{"n":"eyes_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":181.55,"ty":158.15}},{"n":"mouth_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":181.55,"ty":158.15}},{"n":"hair_90","t":{"a":-1,"b":0.01,"c":0.01,"d":1,"tx":180.5,"ty":157.2}},{"n":"chassis_90","t":{"a":-1,"b":-0.01,"c":-0.01,"d":1,"tx":180.2,"ty":253.6}},{"n":"decal_90","t":{"a":-1.2,"b":-0.01,"c":-0.01,"d":1.2,"tx":205.1,"ty":257.35}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.6,"ty":185.6}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179.4,"ty":157.55}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":158.55}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":158.55}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":158.55}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179.4,"ty":157.55}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.15,"ty":254.7}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.25}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":185.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}]],"jump_90":[[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":186.5}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":158.75}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":159.75}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":159.75}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":159.75}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":158.75}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":0.99,"tx":180,"ty":255.3}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.19,"tx":205,"ty":258.75}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":140.7,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.9,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":189}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":162.1}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":163.1}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":163.1}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":163.1}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":162.1}},{"n":"chassis_90","t":{"a":-1.01,"b":0,"c":0,"d":0.97,"tx":179.8,"ty":255.95}},{"n":"decal_90","t":{"a":-1.21,"b":0,"c":0,"d":1.17,"tx":204.9,"ty":259.35}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":139.9,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":301.7,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":193.15}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":167.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":168.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":168.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":168.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":167.65}},{"n":"chassis_90","t":{"a":-1.03,"b":0,"c":0,"d":0.94,"tx":179.4,"ty":257.1}},{"n":"decal_90","t":{"a":-1.23,"b":0,"c":0,"d":1.12,"tx":204.85,"ty":260.4}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":138.5,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":303.1,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":199}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":175.45}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":176.45}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":176.45}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":176.45}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":175.45}},{"n":"chassis_90","t":{"a":-1.05,"b":0,"c":0,"d":0.89,"tx":178.85,"ty":258.7}},{"n":"decal_90","t":{"a":-1.25,"b":0,"c":0,"d":1.06,"tx":204.8,"ty":261.8}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":136.55,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":305.05,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":206.5}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":185.45}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":186.45}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":186.45}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":186.45}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":185.45}},{"n":"chassis_90","t":{"a":-1.07,"b":0,"c":0,"d":0.82,"tx":178.1,"ty":260.8}},{"n":"decal_90","t":{"a":-1.28,"b":0,"c":0,"d":0.98,"tx":204.7,"ty":263.65}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":134.05,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":307.55,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":215.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":197.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":197.65}},{"n":"chassis_90","t":{"a":-1.1,"b":0,"c":0,"d":0.74,"tx":177.25,"ty":263.3}},{"n":"decal_90","t":{"a":-1.32,"b":0,"c":0,"d":0.89,"tx":204.65,"ty":265.9}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":131,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":310.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.65,"ty":210.65}},{"n":"hair_back_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":184.15,"ty":190.65}},{"n":"head_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.2,"ty":191.65}},{"n":"eyes_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.2,"ty":191.65}},{"n":"mouth_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.2,"ty":191.65}},{"n":"hair_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":184.15,"ty":190.65}},{"n":"chassis_90","t":{"a":-1.03,"b":0,"c":0,"d":0.79,"tx":180,"ty":262.6}},{"n":"decal_90","t":{"a":-1.23,"b":0,"c":0,"d":0.95,"tx":205.6,"ty":265.45}},{"n":"wheel_back_90","t":{"a":1.04,"b":0,"c":0,"d":1.08,"tx":137.15,"ty":264.3}},{"n":"wheel_front_90","t":{"a":1.04,"b":0,"c":0,"d":1.08,"tx":304.7,"ty":264.3}}],[{"n":"top_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":188.8,"ty":205.65}},{"n":"hair_back_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":189.3,"ty":183.65}},{"n":"head_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":190.35,"ty":184.65}},{"n":"eyes_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":190.35,"ty":184.65}},{"n":"mouth_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":190.35,"ty":184.65}},{"n":"hair_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":189.3,"ty":183.65}},{"n":"chassis_90","t":{"a":-0.95,"b":0,"c":0,"d":0.84,"tx":182.75,"ty":262}},{"n":"decal_90","t":{"a":-1.14,"b":0,"c":0,"d":1.01,"tx":206.5,"ty":264.95}},{"n":"wheel_back_90","t":{"a":1,"b":0,"c":0,"d":1.08,"tx":143.25,"ty":265.3}},{"n":"wheel_front_90","t":{"a":1,"b":0,"c":0,"d":1.08,"tx":298.8,"ty":265.3}}],[{"n":"top_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.05,"ty":187.65}},{"n":"hair_back_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.55,"ty":163.5}},{"n":"head_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":186.6,"ty":164.5}},{"n":"eyes_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":186.6,"ty":164.5}},{"n":"mouth_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":186.6,"ty":164.5}},{"n":"hair_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.55,"ty":163.5}},{"n":"chassis_90","t":{"a":-0.97,"b":0,"c":0,"d":0.9,"tx":181.8,"ty":248.7}},{"n":"decal_90","t":{"a":-1.16,"b":0,"c":0,"d":1.08,"tx":205.95,"ty":251.85}},{"n":"wheel_back_90","t":{"a":1.03,"b":0,"c":0,"d":1.08,"tx":142.45,"ty":253.8}},{"n":"wheel_front_90","t":{"a":1.03,"b":0,"c":0,"d":1.08,"tx":299.45,"ty":253.8}}],[{"n":"top_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":182.2,"ty":173.65}},{"n":"hair_back_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":182.7,"ty":147.8}},{"n":"head_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.75,"ty":148.8}},{"n":"eyes_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.75,"ty":148.8}},{"n":"mouth_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.75,"ty":148.8}},{"n":"hair_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":182.7,"ty":147.8}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":0.94,"tx":181.05,"ty":238.35}},{"n":"decal_90","t":{"a":-1.18,"b":0,"c":0,"d":1.13,"tx":205.55,"ty":241.65}},{"n":"wheel_back_90","t":{"a":1.05,"b":0,"c":0,"d":1.08,"tx":141.8,"ty":244.8}},{"n":"wheel_front_90","t":{"a":1.05,"b":0,"c":0,"d":1.08,"tx":299.95,"ty":244.8}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":163.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.65,"ty":136.6}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":181.65,"ty":137.6}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":181.65,"ty":137.6}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":181.65,"ty":137.6}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.65,"ty":136.6}},{"n":"chassis_90","t":{"a":-0.99,"b":0,"c":0,"d":0.98,"tx":180.45,"ty":230.95}},{"n":"decal_90","t":{"a":-1.19,"b":0,"c":0,"d":1.17,"tx":205.25,"ty":234.35}},{"n":"wheel_back_90","t":{"a":1.07,"b":0,"c":0,"d":1.08,"tx":141.35,"ty":238.4}},{"n":"wheel_front_90","t":{"a":1.07,"b":0,"c":0,"d":1.08,"tx":300.3,"ty":238.4}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.8,"ty":157.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179.35,"ty":129.9}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":130.9}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":130.9}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":130.9}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179.35,"ty":129.9}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":0.99,"tx":180.2,"ty":226.6}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.19,"tx":205.05,"ty":230}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141.1,"ty":234.6}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.55,"ty":234.6}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":155.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":127.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":128.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":128.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":128.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":127.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":225.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":228.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":233.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":233.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":156.2}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":128.2}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":129.2}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":129.2}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":129.2}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":128.2}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":225.85}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":229.35}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":234.5}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":234.5}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":157.9}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":129.9}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":130.9}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":130.9}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":130.9}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":129.9}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":228.25}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":231.75}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":238.1}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":238.1}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":160.7}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":132.7}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":133.7}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":133.7}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":133.7}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":132.7}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":232.25}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":235.75}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":244.1}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":244.1}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":164.6}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":136.6}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":137.6}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":137.6}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":137.6}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":136.6}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":237.85}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":241.35}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":252.5}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":252.5}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":169.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":141.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":142.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":142.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":142.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":141.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":245.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":248.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":181.15}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"chassis_90","t":{"a":-1.03,"b":0,"c":0,"d":0.94,"tx":179.4,"ty":249.6}},{"n":"decal_90","t":{"a":-1.23,"b":0,"c":0,"d":1.12,"tx":204.85,"ty":252.95}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":138.5,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":303.1,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":215.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":197.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":197.65}},{"n":"chassis_90","t":{"a":-1.1,"b":0,"c":0,"d":0.74,"tx":177.25,"ty":263.3}},{"n":"decal_90","t":{"a":-1.32,"b":0,"c":0,"d":0.89,"tx":204.65,"ty":265.9}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":131,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":310.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.65,"ty":210.65}},{"n":"hair_back_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":184.15,"ty":190.65}},{"n":"head_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.2,"ty":191.65}},{"n":"eyes_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.2,"ty":191.65}},{"n":"mouth_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.2,"ty":191.65}},{"n":"hair_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":184.15,"ty":190.65}},{"n":"chassis_90","t":{"a":-1.03,"b":0,"c":0,"d":0.79,"tx":180,"ty":262.6}},{"n":"decal_90","t":{"a":-1.23,"b":0,"c":0,"d":0.95,"tx":205.6,"ty":265.45}},{"n":"wheel_back_90","t":{"a":1.04,"b":0,"c":0,"d":1.08,"tx":137.15,"ty":264.3}},{"n":"wheel_front_90","t":{"a":1.04,"b":0,"c":0,"d":1.08,"tx":304.7,"ty":264.3}}],[{"n":"top_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":188.8,"ty":205.65}},{"n":"hair_back_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":189.3,"ty":183.65}},{"n":"head_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":190.35,"ty":184.65}},{"n":"eyes_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":190.35,"ty":184.65}},{"n":"mouth_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":190.35,"ty":184.65}},{"n":"hair_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":189.3,"ty":183.65}},{"n":"chassis_90","t":{"a":-0.95,"b":0,"c":0,"d":0.84,"tx":182.75,"ty":262}},{"n":"decal_90","t":{"a":-1.14,"b":0,"c":0,"d":1.01,"tx":206.5,"ty":264.95}},{"n":"wheel_back_90","t":{"a":1,"b":0,"c":0,"d":1.08,"tx":143.25,"ty":265.3}},{"n":"wheel_front_90","t":{"a":1,"b":0,"c":0,"d":1.08,"tx":298.8,"ty":265.3}}],[{"n":"top_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.05,"ty":187.65}},{"n":"hair_back_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.55,"ty":163.5}},{"n":"head_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":186.6,"ty":164.5}},{"n":"eyes_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":186.6,"ty":164.5}},{"n":"mouth_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":186.6,"ty":164.5}},{"n":"hair_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.55,"ty":163.5}},{"n":"chassis_90","t":{"a":-0.97,"b":0,"c":0,"d":0.9,"tx":181.8,"ty":248.7}},{"n":"decal_90","t":{"a":-1.16,"b":0,"c":0,"d":1.08,"tx":205.95,"ty":251.85}},{"n":"wheel_back_90","t":{"a":1.03,"b":0,"c":0,"d":1.08,"tx":142.45,"ty":253.8}},{"n":"wheel_front_90","t":{"a":1.03,"b":0,"c":0,"d":1.08,"tx":299.45,"ty":253.8}}],[{"n":"top_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":182.2,"ty":173.65}},{"n":"hair_back_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":182.7,"ty":147.8}},{"n":"head_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.75,"ty":148.8}},{"n":"eyes_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.75,"ty":148.8}},{"n":"mouth_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.75,"ty":148.8}},{"n":"hair_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":182.7,"ty":147.8}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":0.94,"tx":181.05,"ty":238.35}},{"n":"decal_90","t":{"a":-1.18,"b":0,"c":0,"d":1.13,"tx":205.55,"ty":241.65}},{"n":"wheel_back_90","t":{"a":1.05,"b":0,"c":0,"d":1.08,"tx":141.8,"ty":244.8}},{"n":"wheel_front_90","t":{"a":1.05,"b":0,"c":0,"d":1.08,"tx":299.95,"ty":244.8}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":163.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.65,"ty":136.6}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":181.65,"ty":137.6}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":181.65,"ty":137.6}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":181.65,"ty":137.6}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.65,"ty":136.6}},{"n":"chassis_90","t":{"a":-0.99,"b":0,"c":0,"d":0.98,"tx":180.45,"ty":230.95}},{"n":"decal_90","t":{"a":-1.19,"b":0,"c":0,"d":1.17,"tx":205.25,"ty":234.35}},{"n":"wheel_back_90","t":{"a":1.07,"b":0,"c":0,"d":1.08,"tx":141.35,"ty":238.4}},{"n":"wheel_front_90","t":{"a":1.07,"b":0,"c":0,"d":1.08,"tx":300.3,"ty":238.4}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.8,"ty":157.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179.35,"ty":129.9}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":130.9}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":130.9}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":130.9}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179.35,"ty":129.9}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":0.99,"tx":180.2,"ty":226.6}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.19,"tx":205.05,"ty":230}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141.1,"ty":234.6}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.55,"ty":234.6}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":155.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":127.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":128.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":128.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":128.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":127.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":225.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":228.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":233.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":233.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":156.2}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":128.2}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":129.2}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":129.2}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":129.2}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":128.2}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":225.85}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":229.35}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":234.5}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":234.5}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":157.9}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":129.9}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":130.9}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":130.9}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":130.9}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":129.9}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":228.25}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":231.75}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":238.1}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":238.1}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":160.7}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":132.7}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":133.7}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":133.7}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":133.7}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":132.7}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":232.25}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":235.75}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":244.1}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":244.1}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":164.6}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":136.6}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":137.6}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":137.6}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":137.6}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":136.6}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":237.85}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":241.35}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":252.5}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":252.5}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":169.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":141.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":142.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":142.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":142.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":141.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":245.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":248.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":181.15}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"chassis_90","t":{"a":-1.03,"b":0,"c":0,"d":0.94,"tx":179.4,"ty":249.6}},{"n":"decal_90","t":{"a":-1.23,"b":0,"c":0,"d":1.12,"tx":204.85,"ty":252.95}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":138.5,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":303.1,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":215.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":197.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":197.65}},{"n":"chassis_90","t":{"a":-1.1,"b":0,"c":0,"d":0.74,"tx":177.25,"ty":263.3}},{"n":"decal_90","t":{"a":-1.32,"b":0,"c":0,"d":0.89,"tx":204.65,"ty":265.9}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":131,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":310.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.65,"ty":210.65}},{"n":"hair_back_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":184.15,"ty":190.65}},{"n":"head_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.2,"ty":191.65}},{"n":"eyes_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.2,"ty":191.65}},{"n":"mouth_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.2,"ty":191.65}},{"n":"hair_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":184.15,"ty":190.65}},{"n":"chassis_90","t":{"a":-1.03,"b":0,"c":0,"d":0.79,"tx":180,"ty":262.6}},{"n":"decal_90","t":{"a":-1.23,"b":0,"c":0,"d":0.95,"tx":205.6,"ty":265.45}},{"n":"wheel_back_90","t":{"a":1.04,"b":0,"c":0,"d":1.08,"tx":137.15,"ty":264.3}},{"n":"wheel_front_90","t":{"a":1.04,"b":0,"c":0,"d":1.08,"tx":304.7,"ty":264.3}}],[{"n":"top_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":188.8,"ty":205.65}},{"n":"hair_back_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":189.3,"ty":183.65}},{"n":"head_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":190.35,"ty":184.65}},{"n":"eyes_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":190.35,"ty":184.65}},{"n":"mouth_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":190.35,"ty":184.65}},{"n":"hair_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":189.3,"ty":183.65}},{"n":"chassis_90","t":{"a":-0.95,"b":0,"c":0,"d":0.84,"tx":182.75,"ty":262}},{"n":"decal_90","t":{"a":-1.14,"b":0,"c":0,"d":1.01,"tx":206.5,"ty":264.95}},{"n":"wheel_back_90","t":{"a":1,"b":0,"c":0,"d":1.08,"tx":143.25,"ty":265.3}},{"n":"wheel_front_90","t":{"a":1,"b":0,"c":0,"d":1.08,"tx":298.8,"ty":265.3}}],[{"n":"top_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.05,"ty":187.65}},{"n":"hair_back_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.55,"ty":163.5}},{"n":"head_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":186.6,"ty":164.5}},{"n":"eyes_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":186.6,"ty":164.5}},{"n":"mouth_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":186.6,"ty":164.5}},{"n":"hair_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.55,"ty":163.5}},{"n":"chassis_90","t":{"a":-0.97,"b":0,"c":0,"d":0.9,"tx":181.8,"ty":248.7}},{"n":"decal_90","t":{"a":-1.16,"b":0,"c":0,"d":1.08,"tx":205.95,"ty":251.85}},{"n":"wheel_back_90","t":{"a":1.03,"b":0,"c":0,"d":1.08,"tx":142.45,"ty":253.8}},{"n":"wheel_front_90","t":{"a":1.03,"b":0,"c":0,"d":1.08,"tx":299.45,"ty":253.8}}],[{"n":"top_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":182.2,"ty":173.65}},{"n":"hair_back_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":182.7,"ty":147.8}},{"n":"head_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.75,"ty":148.8}},{"n":"eyes_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.75,"ty":148.8}},{"n":"mouth_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.75,"ty":148.8}},{"n":"hair_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":182.7,"ty":147.8}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":0.94,"tx":181.05,"ty":238.35}},{"n":"decal_90","t":{"a":-1.18,"b":0,"c":0,"d":1.13,"tx":205.55,"ty":241.65}},{"n":"wheel_back_90","t":{"a":1.05,"b":0,"c":0,"d":1.08,"tx":141.8,"ty":244.8}},{"n":"wheel_front_90","t":{"a":1.05,"b":0,"c":0,"d":1.08,"tx":299.95,"ty":244.8}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":163.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.65,"ty":136.6}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":181.65,"ty":137.6}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":181.65,"ty":137.6}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":181.65,"ty":137.6}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.65,"ty":136.6}},{"n":"chassis_90","t":{"a":-0.99,"b":0,"c":0,"d":0.98,"tx":180.45,"ty":230.95}},{"n":"decal_90","t":{"a":-1.19,"b":0,"c":0,"d":1.17,"tx":205.25,"ty":234.35}},{"n":"wheel_back_90","t":{"a":1.07,"b":0,"c":0,"d":1.08,"tx":141.35,"ty":238.4}},{"n":"wheel_front_90","t":{"a":1.07,"b":0,"c":0,"d":1.08,"tx":300.3,"ty":238.4}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.8,"ty":157.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179.35,"ty":129.9}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":130.9}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":130.9}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":130.9}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179.35,"ty":129.9}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":0.99,"tx":180.2,"ty":226.6}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.19,"tx":205.05,"ty":230}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141.1,"ty":234.6}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.55,"ty":234.6}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":155.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":127.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":128.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":128.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":128.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":127.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":225.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":228.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":233.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":233.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":156.2}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":128.2}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":129.2}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":129.2}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":129.2}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":128.2}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":225.85}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":229.35}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":234.5}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":234.5}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":157.9}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":129.9}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":130.9}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":130.9}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":130.9}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":129.9}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":228.25}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":231.75}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":238.1}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":238.1}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":160.7}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":132.7}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":133.7}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":133.7}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":133.7}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":132.7}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":232.25}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":235.75}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":244.1}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":244.1}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":164.6}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":136.6}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":137.6}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":137.6}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":137.6}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":136.6}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":237.85}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":241.35}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":252.5}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":252.5}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":169.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":141.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":142.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":142.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":142.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":141.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":245.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":248.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":181.15}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"chassis_90","t":{"a":-1.03,"b":0,"c":0,"d":0.94,"tx":179.4,"ty":249.6}},{"n":"decal_90","t":{"a":-1.23,"b":0,"c":0,"d":1.12,"tx":204.85,"ty":252.95}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":138.5,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":303.1,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":215.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":197.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":197.65}},{"n":"chassis_90","t":{"a":-1.1,"b":0,"c":0,"d":0.74,"tx":177.25,"ty":263.3}},{"n":"decal_90","t":{"a":-1.32,"b":0,"c":0,"d":0.89,"tx":204.65,"ty":265.9}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":131,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":310.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.65,"ty":210.65}},{"n":"hair_back_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":184.15,"ty":190.65}},{"n":"head_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.2,"ty":191.65}},{"n":"eyes_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.2,"ty":191.65}},{"n":"mouth_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.2,"ty":191.65}},{"n":"hair_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":184.15,"ty":190.65}},{"n":"chassis_90","t":{"a":-1.03,"b":0,"c":0,"d":0.79,"tx":180,"ty":262.6}},{"n":"decal_90","t":{"a":-1.23,"b":0,"c":0,"d":0.95,"tx":205.6,"ty":265.45}},{"n":"wheel_back_90","t":{"a":1.04,"b":0,"c":0,"d":1.08,"tx":137.15,"ty":264.3}},{"n":"wheel_front_90","t":{"a":1.04,"b":0,"c":0,"d":1.08,"tx":304.7,"ty":264.3}}],[{"n":"top_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":188.8,"ty":205.65}},{"n":"hair_back_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":189.3,"ty":183.65}},{"n":"head_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":190.35,"ty":184.65}},{"n":"eyes_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":190.35,"ty":184.65}},{"n":"mouth_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":190.35,"ty":184.65}},{"n":"hair_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":189.3,"ty":183.65}},{"n":"chassis_90","t":{"a":-0.95,"b":0,"c":0,"d":0.84,"tx":182.75,"ty":262}},{"n":"decal_90","t":{"a":-1.14,"b":0,"c":0,"d":1.01,"tx":206.5,"ty":264.95}},{"n":"wheel_back_90","t":{"a":1,"b":0,"c":0,"d":1.08,"tx":143.25,"ty":265.3}},{"n":"wheel_front_90","t":{"a":1,"b":0,"c":0,"d":1.08,"tx":298.8,"ty":265.3}}],[{"n":"top_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.05,"ty":187.65}},{"n":"hair_back_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.55,"ty":163.5}},{"n":"head_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":186.6,"ty":164.5}},{"n":"eyes_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":186.6,"ty":164.5}},{"n":"mouth_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":186.6,"ty":164.5}},{"n":"hair_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.55,"ty":163.5}},{"n":"chassis_90","t":{"a":-0.97,"b":0,"c":0,"d":0.9,"tx":181.8,"ty":248.7}},{"n":"decal_90","t":{"a":-1.16,"b":0,"c":0,"d":1.08,"tx":205.95,"ty":251.85}},{"n":"wheel_back_90","t":{"a":1.03,"b":0,"c":0,"d":1.08,"tx":142.45,"ty":253.8}},{"n":"wheel_front_90","t":{"a":1.03,"b":0,"c":0,"d":1.08,"tx":299.45,"ty":253.8}}],[{"n":"top_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":182.2,"ty":173.65}},{"n":"hair_back_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":182.7,"ty":147.8}},{"n":"head_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.75,"ty":148.8}},{"n":"eyes_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.75,"ty":148.8}},{"n":"mouth_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.75,"ty":148.8}},{"n":"hair_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":182.7,"ty":147.8}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":0.94,"tx":181.05,"ty":238.35}},{"n":"decal_90","t":{"a":-1.18,"b":0,"c":0,"d":1.13,"tx":205.55,"ty":241.65}},{"n":"wheel_back_90","t":{"a":1.05,"b":0,"c":0,"d":1.08,"tx":141.8,"ty":244.8}},{"n":"wheel_front_90","t":{"a":1.05,"b":0,"c":0,"d":1.08,"tx":299.95,"ty":244.8}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":163.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.65,"ty":136.6}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":181.65,"ty":137.6}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":181.65,"ty":137.6}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":181.65,"ty":137.6}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.65,"ty":136.6}},{"n":"chassis_90","t":{"a":-0.99,"b":0,"c":0,"d":0.98,"tx":180.45,"ty":230.95}},{"n":"decal_90","t":{"a":-1.19,"b":0,"c":0,"d":1.17,"tx":205.25,"ty":234.35}},{"n":"wheel_back_90","t":{"a":1.07,"b":0,"c":0,"d":1.08,"tx":141.35,"ty":238.4}},{"n":"wheel_front_90","t":{"a":1.07,"b":0,"c":0,"d":1.08,"tx":300.3,"ty":238.4}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.8,"ty":157.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179.35,"ty":129.9}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":130.9}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":130.9}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":130.9}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179.35,"ty":129.9}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":0.99,"tx":180.2,"ty":226.6}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.19,"tx":205.05,"ty":230}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141.1,"ty":234.6}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.55,"ty":234.6}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":155.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":127.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":128.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":128.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":128.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":127.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":225.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":228.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":233.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":233.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":156.2}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":128.2}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":129.2}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":129.2}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":129.2}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":128.2}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":225.85}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":229.35}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":234.5}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":234.5}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":157.9}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":129.9}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":130.9}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":130.9}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":130.9}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":129.9}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":228.25}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":231.75}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":238.1}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":238.1}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":160.7}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":132.7}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":133.7}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":133.7}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":133.7}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":132.7}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":232.25}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":235.75}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":244.1}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":244.1}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":164.6}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":136.6}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":137.6}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":137.6}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":137.6}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":136.6}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":237.85}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":241.35}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":252.5}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":252.5}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":169.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":141.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":142.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":142.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":142.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":141.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":245.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":248.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":181.15}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":156.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":155.65}},{"n":"chassis_90","t":{"a":-1.03,"b":0,"c":0,"d":0.94,"tx":179.4,"ty":249.6}},{"n":"decal_90","t":{"a":-1.23,"b":0,"c":0,"d":1.12,"tx":204.85,"ty":252.95}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":138.5,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":303.1,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":215.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":197.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":197.65}},{"n":"chassis_90","t":{"a":-1.1,"b":0,"c":0,"d":0.74,"tx":177.25,"ty":263.3}},{"n":"decal_90","t":{"a":-1.32,"b":0,"c":0,"d":0.89,"tx":204.65,"ty":265.9}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":131,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":310.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.65,"ty":210.65}},{"n":"hair_back_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":184.15,"ty":190.65}},{"n":"head_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.2,"ty":191.65}},{"n":"eyes_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.2,"ty":191.65}},{"n":"mouth_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.2,"ty":191.65}},{"n":"hair_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":184.15,"ty":190.65}},{"n":"chassis_90","t":{"a":-1.03,"b":0,"c":0,"d":0.79,"tx":180,"ty":262.6}},{"n":"decal_90","t":{"a":-1.23,"b":0,"c":0,"d":0.95,"tx":205.6,"ty":265.45}},{"n":"wheel_back_90","t":{"a":1.04,"b":0,"c":0,"d":1.08,"tx":137.15,"ty":264.3}},{"n":"wheel_front_90","t":{"a":1.04,"b":0,"c":0,"d":1.08,"tx":304.7,"ty":264.3}}],[{"n":"top_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":188.8,"ty":205.65}},{"n":"hair_back_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":189.3,"ty":183.65}},{"n":"head_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":190.35,"ty":184.65}},{"n":"eyes_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":190.35,"ty":184.65}},{"n":"mouth_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":190.35,"ty":184.65}},{"n":"hair_90","t":{"a":-1.02,"b":0,"c":0,"d":1,"tx":189.3,"ty":183.65}},{"n":"chassis_90","t":{"a":-0.95,"b":0,"c":0,"d":0.84,"tx":182.75,"ty":262}},{"n":"decal_90","t":{"a":-1.14,"b":0,"c":0,"d":1.01,"tx":206.5,"ty":264.95}},{"n":"wheel_back_90","t":{"a":1,"b":0,"c":0,"d":1.08,"tx":143.25,"ty":265.3}},{"n":"wheel_front_90","t":{"a":1,"b":0,"c":0,"d":1.08,"tx":298.8,"ty":265.3}}],[{"n":"top_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.05,"ty":187.65}},{"n":"hair_back_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.55,"ty":163.5}},{"n":"head_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":186.6,"ty":164.5}},{"n":"eyes_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":186.6,"ty":164.5}},{"n":"mouth_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":186.6,"ty":164.5}},{"n":"hair_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":185.55,"ty":163.5}},{"n":"chassis_90","t":{"a":-0.97,"b":0,"c":0,"d":0.9,"tx":181.8,"ty":248.7}},{"n":"decal_90","t":{"a":-1.16,"b":0,"c":0,"d":1.08,"tx":205.95,"ty":251.85}},{"n":"wheel_back_90","t":{"a":1.03,"b":0,"c":0,"d":1.08,"tx":142.45,"ty":253.8}},{"n":"wheel_front_90","t":{"a":1.03,"b":0,"c":0,"d":1.08,"tx":299.45,"ty":253.8}}],[{"n":"top_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":182.2,"ty":173.65}},{"n":"hair_back_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":182.7,"ty":147.8}},{"n":"head_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.75,"ty":148.8}},{"n":"eyes_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.75,"ty":148.8}},{"n":"mouth_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":183.75,"ty":148.8}},{"n":"hair_90","t":{"a":-1.01,"b":0,"c":0,"d":1,"tx":182.7,"ty":147.8}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":0.94,"tx":181.05,"ty":238.35}},{"n":"decal_90","t":{"a":-1.18,"b":0,"c":0,"d":1.13,"tx":205.55,"ty":241.65}},{"n":"wheel_back_90","t":{"a":1.05,"b":0,"c":0,"d":1.08,"tx":141.8,"ty":244.8}},{"n":"wheel_front_90","t":{"a":1.05,"b":0,"c":0,"d":1.08,"tx":299.95,"ty":244.8}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":163.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.65,"ty":136.6}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":181.65,"ty":137.6}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":181.65,"ty":137.6}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":181.65,"ty":137.6}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.65,"ty":136.6}},{"n":"chassis_90","t":{"a":-0.99,"b":0,"c":0,"d":0.98,"tx":180.45,"ty":230.95}},{"n":"decal_90","t":{"a":-1.19,"b":0,"c":0,"d":1.17,"tx":205.25,"ty":234.35}},{"n":"wheel_back_90","t":{"a":1.07,"b":0,"c":0,"d":1.08,"tx":141.35,"ty":238.4}},{"n":"wheel_front_90","t":{"a":1.07,"b":0,"c":0,"d":1.08,"tx":300.3,"ty":238.4}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.8,"ty":157.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179.35,"ty":129.9}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":130.9}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":130.9}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.4,"ty":130.9}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179.35,"ty":129.9}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":0.99,"tx":180.2,"ty":226.6}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.19,"tx":205.05,"ty":230}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141.1,"ty":234.6}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.55,"ty":234.6}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":155.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":127.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":128.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":128.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":128.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":127.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":225.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":228.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":233.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":233.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":157.3}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":129.6}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":130.6}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":130.6}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":130.6}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":129.6}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":0.99,"tx":180.15,"ty":226.1}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.19,"tx":205,"ty":229.6}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":140.85,"ty":234.15}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.75,"ty":234.15}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":162.3}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":135.45}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":136.45}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":136.45}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":136.45}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":135.45}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":0.97,"tx":180.35,"ty":229.3}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.17,"tx":205.2,"ty":232.75}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":140.45,"ty":236.65}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":301.15,"ty":236.65}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":170.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":145.15}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":146.15}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":146.15}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":146.15}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":145.15}},{"n":"chassis_90","t":{"a":-0.99,"b":0,"c":0,"d":0.94,"tx":180.7,"ty":234.6}},{"n":"decal_90","t":{"a":-1.19,"b":0,"c":0,"d":1.12,"tx":205.45,"ty":237.9}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":139.75,"ty":240.8}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":301.85,"ty":240.8}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":182.3}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":158.75}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":159.75}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":159.75}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":159.75}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":158.75}},{"n":"chassis_90","t":{"a":-0.99,"b":0,"c":0,"d":0.89,"tx":181.15,"ty":242.05}},{"n":"decal_90","t":{"a":-1.19,"b":0,"c":0,"d":1.06,"tx":205.75,"ty":245.2}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":138.8,"ty":246.65}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":302.8,"ty":246.65}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":197.3}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":176.25}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":177.25}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":177.25}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":177.25}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":176.25}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":0.82,"tx":181.75,"ty":251.6}},{"n":"decal_90","t":{"a":-1.18,"b":0,"c":0,"d":0.98,"tx":206.2,"ty":254.5}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":137.55,"ty":254.15}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":304.05,"ty":254.15}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":215.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":197.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":198.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":197.65}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":0.74,"tx":182.45,"ty":263.3}},{"n":"decal_90","t":{"a":-1.17,"b":0,"c":0,"d":0.89,"tx":206.7,"ty":265.9}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":136,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":305.6,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":210.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":191}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":192}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":192}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":192}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":191}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":0.78,"tx":182,"ty":261.95}},{"n":"decal_90","t":{"a":-1.18,"b":0,"c":0,"d":0.94,"tx":206.4,"ty":264.7}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":137.55,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":304.05,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":205.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":184.3}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":185.3}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":185.3}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":185.3}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":184.3}},{"n":"chassis_90","t":{"a":-0.98,"b":0,"c":0,"d":0.83,"tx":181.65,"ty":260.55}},{"n":"decal_90","t":{"a":-1.18,"b":0,"c":0,"d":0.99,"tx":206.2,"ty":263.45}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":138.8,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":302.8,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":200.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":177.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":178.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":178.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":178.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":177.65}},{"n":"chassis_90","t":{"a":-0.99,"b":0,"c":0,"d":0.87,"tx":181.25,"ty":259.15}},{"n":"decal_90","t":{"a":-1.19,"b":0,"c":0,"d":1.04,"tx":205.85,"ty":262.25}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":139.75,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":301.85,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":195.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":171}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":172}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":172}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":172}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":171}},{"n":"chassis_90","t":{"a":-0.99,"b":0,"c":0,"d":0.91,"tx":180.9,"ty":257.75}},{"n":"decal_90","t":{"a":-1.19,"b":0,"c":0,"d":1.1,"tx":205.6,"ty":261.05}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":140.45,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":301.15,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":190.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":164.3}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":165.3}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":165.3}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":165.3}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":164.3}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":0.96,"tx":180.45,"ty":256.45}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.15,"tx":205.3,"ty":259.85}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":140.85,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.75,"ty":263.3}}],[{"n":"top_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":178.45,"ty":185.65}},{"n":"hair_back_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"head_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"eyes_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"mouth_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180,"ty":158.65}},{"n":"hair_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":179,"ty":157.65}},{"n":"chassis_90","t":{"a":-1,"b":0,"c":0,"d":1,"tx":180.1,"ty":255.05}},{"n":"decal_90","t":{"a":-1.2,"b":0,"c":0,"d":1.2,"tx":205,"ty":258.55}},{"n":"wheel_back_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":141,"ty":263.3}},{"n":"wheel_front_90","t":{"a":1.08,"b":0,"c":0,"d":1.08,"tx":300.6,"ty":263.3}}]],"idle_90_next":["loop"],"jump_90_next":["loop"]},
				animationSequence : "idle",

				//default world and assets domains
				worldDomain  : "http://kartkingdom.pbskids.org",
				assetsDomain : "http://kartkingdom-assets.pbskids.org/sprites/"
			};

			(function(){
				_log("_init()");

				for( var i in options ){
					//Get user defined options
					_options[i] = options[i];
				}

				_log( "scale: ", _options.scale);
				_options.scale = parseFloat(_options.scale);
				if( isNaN( _options.scale ) ){
					_options.scale = "1.0";
				}
				else{
					_options.scale = Math.min( _options.scale , 2.34 );//DO NOT exceed a scale of 234%;
				}

				if( (_options.scale + "").indexOf(".") === -1 ){
					_options.scale += ".0";
				}
				_log( "scale ajusted: ", _options.scale);

				//Load the png data into an image object and build the canvas on which to draw the avatar
				_avatarEl = $("<canvas class='" + _options.avatarBaseClass + "' width='" + (350 * parseFloat(_options.scale)) + "px' height='" + (350 * parseFloat(_options.scale)) + "px'></canvas>").addClass( _options.avatarBaseClass ).appendTo( $(parentEl) );
				_avatarCanvas = _avatarEl.get(0).getContext("2d");

				//Build avatar using provided userid, userid in the cookies, or supplied object of avatar layers
				_log("typeof _options.avatar: ", typeof(_options.avatar) );
				if( _options.avatar === "random" ) {
					_buildRandomAvatar();
					return;
				}
				else if( _options.avatar === "randomkart" ) {
					_buildRandomAvatar({
						//"Heads"  : { id : "" },
						//"Hair"   : { id : "" },
						//"Eyes"   : { id : "" },
						//"Mouths" : { id : "" },
						"Bodies" : { id : "" },//apparently the avatar body and the chassis are bound together
						//"Car_Parts" : { id : "" },//Could NOT notice what this was pulling in
						"Wheels"    : { id : "" },
						"Stickers"  : { id : "" }
					});
					return;
				}
				else if( _options.avatar && typeof _options.avatar === "object" ){
					var layersPackage = "packet.avatars.0.layers";
					var parts = layersPackage.split(".");
					var layersObj = _options.avatar;

					_log("_options.avatar: ", _options.avatar);

					if( !_options.avatar[0] || !_options.avatar[0].id ){
						for( var p in parts ){
							_log( "layersObj["+parts[p]+"]: ", layersObj[ parts[p] ] );
							layersObj = layersObj[ parts[p] ] || layersObj;
						}
					}

					_log( "layersObj: ", layersObj );

					if( $.isArray(layersObj) && layersObj.length > 0 && layersObj[0].id ){
						_loadAvatarSprite( layersObj );
						return;
					}

					_log("'avatarLayers' object is not, nor does it contain, a 'layers' array", "warn");
				}

				if( !_options.userid ){
					_options.userid = _getCookie('pbskids.userid');
					if( !_options.userid ) {
						_log("No user is currently logged in and no user-id was provided.", "warn");
						return;
					}
				}

				_loadAvatarInventories( _options.userid );

			}());//_init()

			function _destroy(){
				// Abort all active ajax requests
				_log("Abort all active ajax requests and timeouts");
				for (var reqID in _activeAjaxRequests){
					_log("Abort " + reqID, _activeAjaxRequests[reqID]);
					_activeAjaxRequests[reqID].abort();
					delete _activeAjaxRequests[reqID];
				}

				// Disable public methods
				_log("Disable public methods");
				for( var prop in _that ){
					if( _that.hasOwnProperty(prop) && typeof(_that[prop]) === "function" ){
						_that[prop] = function(){ return false; };
					}
				}

				// Remove elements along with bound events and associated data
				_log("Destroy elements");
				_avatarEl.remove();

				// Null all the things!!!
				_log("Null all the things!!!");
				_target = null;
				_avatarPNG = null;
				_avatarJSON = null;
				_avatarCanvas = null;
				_options = {};

				_log("AVATAR ANIMATION DESTROYED");
			} //_destroy()

			function _drawAvatarLayer(canvas, layerImage, layerTransform, scale, layerDesc)
			{//Build and animate avatar
				//_log("_drawAvatarLayer()");
				scale = scale || 1;
				var _tx = scale * ((layerTransform.a * parseFloat(layerDesc.rx, 10)) + (layerTransform.c * parseFloat(layerDesc.ry, 10)) + layerTransform.tx);
				var _ty = scale * ((layerTransform.b * parseFloat(layerDesc.rx, 10)) + (layerTransform.d * parseFloat(layerDesc.ry, 10)) + layerTransform.ty);
				//_log("layerDesc: ", layerDesc);
				//_log("layerTransform: ", layerTransform);
				canvas.setTransform( layerTransform.a, layerTransform.b, layerTransform.c, layerTransform.d, _tx, _ty );
				canvas.drawImage( layerImage, layerDesc.x, layerDesc.y, layerDesc.w, layerDesc.h, 0, 0, layerDesc.w, layerDesc.h );
			}//_drawAvatarLayer()

			function _animate( animation ){
				//_log("_animate()");

				if( !_avatarCanvas || !_avatarPNG || !_avatarJSON ){
					return;
				}

				var animationSequence;
				switch( (animation || "idle").toLowerCase() ){
					case "walk":
						animationSequence = _options.animationData.walk_90;
						break;

					//case "idle":
						default:
						animationSequence = _options.animationData.idle_90;
				}
				//_log("animationSequence: ", animationSequence);

				for( var i in animationSequence[0] ){
					//Build the layers for the avatar
					var layerClass = animationSequence[0][i].n;
					var transform = animationSequence[0][i].t;
					if( _avatarJSON[layerClass] ){
						_drawAvatarLayer( _avatarCanvas, _avatarPNG, transform, _options.scale, _avatarJSON[layerClass]);
					}
				}
			}//_animate()

			function _onLoadAvatarSprite(response)
			{//Capture Avatar png sprite sheet, json descriptor for png sprite sheet, and animation file/data.
				_log("_onLoadAvatarSprite()");
				var _avatar = response.split("|");//Virtual World avatar: _avatar[0] = descriptor json, _avatar[1] = texture atlas png

				//Descriptor JSON: decode the base64 string to a json object
				var _avatarJSONString = Base64.decode( _avatar[0] );
				_avatarJSONString = _avatarJSONString.replace(/("r[x|y]"):"null"/g, "$1:0");
				_avatarJSON = JSON.parse( _avatarJSONString );

				//Load the png data into an image object
				_avatarPNG = new Image();
				_avatarPNG.onload = function(){ _animate("idle"); };
				_avatarPNG.src = "data:image/png;base64," + _avatar[1];
			}//_onLoadAvatarSprite()

			function _loadAvatarSprite( avatarLayers ){
				_log("_loadAvatarSprite()");

				var params = _options.scale + "";
				for( var i = 0 ; i < avatarLayers.length ; i++ ){
					params += "/" + avatarLayers[i].id;
				}

				var ajaxID = "ajax_" + (_ajaxID ++);
				_activeAjaxRequests[ajaxID] = $.ajax({
					//load avatar sprite sheet and json descriptor
					url: _options.assetsDomain + "/" + params +'.avatar',
					complete: function(){
						delete _activeAjaxRequests[ajaxID];
					},
					success : _onLoadAvatarSprite//success()
				});//.ajax()
			}//_loadAvatarSprite()

			function _loadAvatarInventories( userid ){
				_log("_loadAvatarInventories()");
				var ajaxID = "ajax_" + (_ajaxID ++);
				_activeAjaxRequests[ajaxID] = $.ajax({
					url: _options.worldDomain + "/api/pbs/" + userid + "/avatars.nexus",
					complete: function(){
						delete _activeAjaxRequests[ajaxID];
					},
					success : function(response){
						if( response.packet && response.packet.avatars && response.packet.avatars[0] && response.packet.avatars[0].layers ){
							_loadAvatarSprite( response.packet.avatars[0].layers );
						}
						else{
							_log("Could NOT find an avatar inventory list for userid, " + userid, response, "error", true);
						}
					}
				});
			}//_loadAvatarInventories()

			function _buildRandomAvatar( groups ){
				//[TODO] load list of all products
				groups = groups || {
					"Heads"  : { id : "" },
					"Hair"   : { id : "" },
					"Eyes"   : { id : "" },
					"Mouths" : { id : "" },
					"Bodies" : { id : "" },
					//"Face items" : { id : "" },
					//"Car_Parts" : { id : "" },
					"Wheels"    : { id : "" },
					"Stickers"  : { id : "" }
				};

				var __layersObject = [];

				function __onLoadGroup( groupName, groupID, response ){
					if( response && response.packet && response.packet.length > 0 ){
						if( !PBS.KIDS.KartKingdom.productGroups[ groupName ] ){
							PBS.KIDS.KartKingdom.productGroups[ groupName ] = response;
							if( supportsLocalStorage ){
								localStorage["/kartkingdom:productGroups"] = JSON.stringify( PBS.KIDS.KartKingdom.productGroups );
							}
						}

						groups[ groupName ].id = response.packet[ _randomInt( response.packet.length - 1, 0) ].id;
						__layersObject.push( { id : groups[ groupName ].id } );

						for( var i in groups ){
							if( !groups[i].id ){
								//_log( "Group, '" + i + "', does not have a an id set yet" );
								return;
							}
						}

						//_log( "All groups have ids set and a layers object has been built", __layersObject );
						_loadAvatarSprite( __layersObject );
					}
					else{
						_log("Response for '" + groupName + "', 'product_group/" + groupID + "/products.nexus', came back empty", response, "error");
					}
				}//__onLoadGroup()

				function __loadGroup( groupName, groupID ){
					var ajaxID = "ajax_" + (_ajaxID ++);
					_activeAjaxRequests[ajaxID] = $.ajax({url : _options.worldDomain + "/api/product_groups/" + groupID +"/products.nexus",
						complete: function(){
							delete _activeAjaxRequests[ajaxID];
						},
						success : function(response){ __onLoadGroup( groupName, groupID, response); }
					});//.ajax()
				}//__loadGroup()

				function __onLoadProductGroups( response ){
					if( response && response.packet ){
						if( !PBS.KIDS.KartKingdom.productGroups ){
							PBS.KIDS.KartKingdom.productGroups = { allGroups : response };
							if( supportsLocalStorage ){
								localStorage["/kartkingdom:productGroups"] = JSON.stringify( PBS.KIDS.KartKingdom.productGroups );
							}
						}
						else if( !PBS.KIDS.KartKingdom.productGroups.allGroups ){
							//unlikely scenerio where PBS.KIDS.KartKingdom.productGroups exists and
							//PBS.KIDS.KartKingdom.productGroups.allGroups does not, but protect against it just in case.
							PBS.KIDS.KartKingdom.productGroups.allGroups = response;
							if( supportsLocalStorage ){
								localStorage["/kartkingdom:productGroups"] = JSON.stringify( PBS.KIDS.KartKingdom.productGroups );
							}
						}

						for( var i in response.packet ){
							if( groups[ response.packet[i].name ] ){
								if( PBS.KIDS.KartKingdom.productGroups[ response.packet[i].name ] ){
									__onLoadGroup( response.packet[i].name, response.packet[i].id, PBS.KIDS.KartKingdom.productGroups[ response.packet[i].name ] );
								}
								else{
									__loadGroup( response.packet[i].name, response.packet[i].id );
								}
							}
						}
					}
					else{
						_log("Response for product_groups.nexus came back empty", response, "error");
					}
				}//__onLoadProductGroups()

				//Collect all products groups either from memory, localstorage, or from servers
				if( PBS.KIDS.KartKingdom.productGroups ) {
					__onLoadProductGroups( PBS.KIDS.KartKingdom.productGroups.allGroups );
					_log( "PBS.KIDS.KartKingdom.productGroups found in memory" );
				}
				else if( supportsLocalStorage ){
					var pg = localStorage["/kartkingdom:productGroups"];
					if( pg ){
						pg = JSON.parse( pg );
						if( pg.allGroups && pg.allGroups.packet && pg.allGroups.packet[0] ){
							PBS.KIDS.KartKingdom.productGroups = pg;
							__onLoadProductGroups( PBS.KIDS.KartKingdom.productGroups.allGroups );
							_log( "PBS.KIDS.KartKingdom.productGroups found in localStorage" );
						}
					}
				}

				if( !PBS.KIDS.KartKingdom.productGroups ){
					//If still not found then pull product_groups from server
					_log( "PBS.KIDS.KartKingdom.productGroups NOT FOUND, pull from server" );
					var ajaxID = "ajax_" + (_ajaxID ++);
					_activeAjaxRequests[ajaxID] = $.ajax({
						url : _options.worldDomain + "/api/product_groups.nexus",
						complete: function(){
							delete _activeAjaxRequests[ajaxID];
						},
						success : __onLoadProductGroups
					});//.ajax()
				}
			}//_buildRandomAvatar

			function _randomInt(upperlimit, lowerlimit){
				var u = !isNaN(upperlimit) ? upperlimit : 1; //doing it this way to allow passing 0 as an upperlimit
				var l = (lowerlimit || 0);
				return Math.min(u, Math.floor(l + Math.random() * (u - l +1)));
			}//_randomInt()

			this.animate = function( animationSequence ){ _animate( animationSequence ); };
			this.destroy = function(){ _destroy(); };

	};}));
}());

/*! Source: src/kartkingdom.minigame.js*/
(function(){
	"use strict";
	var _APP_NAME = "Kart Kingdom Minigame API";
	var _APP_VERS = "2.0.2";
	var _CSS_VERS = "1.1";
	var _DEBUG = window.location.hostname.match(/^((?!(www|springroll)(\-tc)?\.).+)pbskids\.org$/) ? true : false;
	var _log = function(message, args, type, force){
		if( _DEBUG === true || force === true ){
			if( typeof message === "string" || !!args ){
				message = _APP_NAME + " ver. " + _APP_VERS + " | " + message;
			}
			else{
				args = message;
				message = _APP_NAME + " ver. " + _APP_VERS + " | ";
			}

			if(typeof console!=="undefined"){
				if(type === "error" && console.error){
					console.error(message,args);
				}
				else if(type === "error" && window.Error){
					throw new Error(message);
				}
				else if(type === "info" && console.info){
					console.info(message,args);
				}
				else if(type === "warn" && console.warn){
					console.warn(message,args);
				}
				else if(console.log){
					console.log(message,args);
				}
				else if(typeof window.debug !== "undefined"){
					window.debug.log.apply(message,args);
				}
			}
		}
	};

	var _createPackage = function(packagePath) {
		var dir, pak = typeof exports !== "undefined" ? exports : window;
		if (typeof packagePath === "string") {
			dir = packagePath.split(".");
			for (var i in dir) {
				if (!pak[dir[i]]){
					pak[dir[i]] = {};
				}
				pak = pak[dir[i]];
			}
		}
		return pak;
	};

	var _getCookie = function(c_name) {
		if (document.cookie.length > 0) {
			var c_end, c_start = document.cookie.indexOf(c_name + "=");
			if (c_start !== -1) {
				c_start = c_start + c_name.length + 1;
				c_end = document.cookie.indexOf(";", c_start);
				if (c_end === -1){
					c_end = document.cookie.length;
				}
				return decodeURI(document.cookie.substring(c_start, c_end));
			}
		}
		return "";
	};

	(function(factory){
		// create top-level object
		_createPackage("PBS.KIDS.KartKingdom");
		if( typeof(namespace) === "function" ){
			namespace("springroll.pbskids.kartkingdom");
		}

		// capture PBSKIDS define and require methods
		var define = PBS.KIDS.define;
		var require = PBS.KIDS.require;

		// Check for AMD Support AND if this file was loaded using require()
		if (typeof define === "function" && define.amd && typeof require === "function" && require.specified && require.specified("kartkingdom/minigame-api")){
			define("kartkingdom/minigame-api", [], function(){
				// construct PBS.KIDS.KartKingdom as a browser global and return it to require.js
				_log("Has AMD Support");
				PBS.KIDS.KartKingdom.minigame = factory();
				return PBS.KIDS.KartKingdom.minigame;
			});
		}
		else {
			// construct browser global
			_log("NO AMD Support found");
			PBS.KIDS.KartKingdom.minigame = factory();
		}
	}( function(){
		PBS.KIDS.KartKingdom.minigameEvent = (function(){

			var _EVENT_CLASS = "pbskids_kartkingdom_minigameEvent";

			return {

				MINIGAME_READY: _EVENT_CLASS + "_MinigameReady",
				LEVEL_COMPLETE_OPEN: _EVENT_CLASS + "_LevelCompleteOpen",
				LEVEL_COMPLETE_CLOSED: _EVENT_CLASS + "_LevelCompleteClosed",
				LEVEL_RESET: _EVENT_CLASS + "_LevelReset",
				POWERUP_CONSUMED: _EVENT_CLASS + "_PowerupConsumed",
				POWERUP_CONSUME_FAILED: _EVENT_CLASS + "_PowerupConsumeFailed",
				RESOURCES_EARNED: _EVENT_CLASS + "_ResourcesEarned",
				RESOURCE_REQUEST_COMPLETE: _EVENT_CLASS + "_ResourceRequestComplete"
			}; //return
		}()); //minigameEvent()

		//Assign to namespace
		if( typeof(namespace) === "function" ){
			namespace("springroll.pbskids.kartkingdom").MinigameEvent = PBS.KIDS.KartKingdom.minigameEvent;
		}

		PBS.KIDS.KartKingdom.minigame = function( gameID, elementID, pauseFunc, unPauseFunc, options ){
			
			_log("LOADED");

			// Capture the target window, e.g iframe in springroll container.
			var target = options ? options.target || window : window;
			_log("target = ", target);

			var _that = this;
			var _player = {}; //Object to contain player info and loggin status
			var _vwChannel; //Channel Object to communicate with virtual world when in the VW minigame iFrame
			var _gameWrapper;
			var _cheator;
			var _avatarAnim;
			var _options = options || {};
			var _apiReady = false;
			var _isIframed = (window.top !== window);
			var _eventsCalled = 0; //How many events have been called to vw backend, but have yet to recieve a response
			var _eventsToAdd = {}; //In case any kisteners are added before _gameWrapper is defined, save them temporarily and bind on _finalize()

			var _activeAjaxRequests = {};
			var _ajaxID = 1;//Incrementing ID for keeping track of active ajax requests

			// Parameters for onResize() method
			var _resizeCarousel = false;
			var _carouselList;
			var _maskWidth;
			var _scrollingBounds;

			// Subdomains of pbskids.org (e.g. soup and stage) should point to domain root, all others point to cdn.
			var _PBS_DOMAIN = _DEBUG ? "http://" + window.location.hostname : "http://www-tc.pbskids.org";
			var _REWARDS_API = _PBS_DOMAIN.replace("www-tc.", "") + "/go/apps/kartkingdom/rewards/";
			_log("PBS_DOMAIN  =", _PBS_DOMAIN);
			_log("REWARDS_API =", _REWARDS_API);

			// Virtual World Environment Parameters
			var _isVirtualWorld = false;
			var _ASSETS_DOMAIN;
			var _VW_DOMAIN;
			var _VW_DOMAINS = [
				/http\:\/\/(.+\.)?kartkingdom\.(com|org)/,
				"http://pancake.dubitcloud.com"
			];

			// Device attributes
			var _IS_TOUCH_PAD = (/hp-tablet/gi).test(navigator.appVersion);
			var _HAS_POINTER = (window.navigator.msPointerEnabled || false);
			var _HAS_TOUCH = ("ontouchstart" in window && !_IS_TOUCH_PAD);
			_log("IS_TOUCH_PAD = " + _IS_TOUCH_PAD);
			_log("HAS_POINTER  = " + _HAS_POINTER);
			_log("HAS_TOUCH    = " + _HAS_TOUCH);

			// jsChannel parameters
			var _channelReadyTimeout;

			// Notification bubble parameters
			var _hideNotificationTimeout;
			var _notifications_enabled;
			var _validateInt = function(value, default_value){ return (value && !isNaN(value) ? value : default_value); };

			_options.hide_notification_delay = _validateInt(_options.hide_notification_delay, 2000);
			_options.fade_notification_duration = _validateInt(_options.fade_notification_duration, 500);
			_options.slide_notification_duration = _validateInt(_options.slide_notification_duration, 750);
			_options.enable_notifications = (_options.enable_notifications !== false);//default to true
			_options.enable_producer_notifications = (_options.enable_producer_notifications === true);//default to false

			_log("Hide Notification Delay = ", _options.hide_notification_delay);
			_log("Fade Notification Duration = ", _options.fade_notification_duration);
			_log("Slide Notification Duration = ", _options.slide_notification_duration);
			_log("Enable Notifications = ", _options.enable_notifications);
			_log("Enable Notifications on Producer Site = ", _options.enable_producer_notifications);

			// Libraries and dependencies
			var $; //local version of jQuery
			var _deps = {
				// load css before js because css is loaded async
				// while js is loaded in the order listed.
				"Main CSS" : {
					"name": "Minigame API CSS",
					"id" : "kartkingdom-minigame-api-css",
					"type": "css",
					"loaded": false, //may set this dynamically
					"load": true,
					"url"    : _PBS_DOMAIN + "/kartkingdom/api/css/kartkingdom.minigame." + _CSS_VERS + ".css"
				},

				"Channel" : {
					"name": "Channel",
					"id" : "kartkingdom-minigame-api-jschannel-js",
					"type": "js",
					"lib": undefined,
					"loaded": false,
					"load": _isIframed,
					"url": _PBS_DOMAIN + "/kartkingdom/api/js/jschannel.js"
				}
			};

			(function(){
				_log("init()");
				var validated = _validateGame();
				if( !validated.success ){
					_log(validated.message, null, "error", true);
					return;
				}

				_log("Dependencies: ", _deps);
				_loadDependencies(_finalize);

			}()); //_init()

			function _finalize(){
				_log("finalize()");

				// Grab the game wrapper and set its position to relative if no positioning is already set
				_gameWrapper = $("#" + elementID);
				if (!_gameWrapper.css("position") || _gameWrapper.css("position") === "static"){
					_gameWrapper.css("position", "relative");
				}
				$(_gameWrapper).css({"overflow":"hidden"});

				// If no jquery on target then add local version to target
				if (!target.$){
					target.$ = $;
				}

				// Add Listeners for PBSKIDS Login events (Important to add to target and window)
				target.$(document).on("org_pbskids_login_LoginEvent_LoggedIn", _onLoggedIn);
				target.$(document).on("org_pbskids_login_LoginEvent_LoggedOut", _checkLogin);
				if( target !== window ){
					window.$(document).on("org_pbskids_login_LoginEvent_LoggedIn", _onLoggedIn);
					window.$(document).on("org_pbskids_login_LoginEvent_LoggedOut", _checkLogin);
				}

				// Add Any Listeners which were added before _gameWrapper was defined
				for( var _eType in _eventsToAdd ){
					_addEventListener(_eType, _eventsToAdd[_eType]);
				}

				// Set default values for the virtual world url and the virtual world assets url
				if( window.location.hostname.match(/^((?!www(\-tc)?\.).+)pbskids\.org$/) ){
					_VW_DOMAIN = "http://stage.kartkingdom.org";
					_ASSETS_DOMAIN = "http://stage.kartkingdom.org/sprites";
				}
				else{
					_VW_DOMAIN = "http://kartkingdom.pbskids.org";
					_ASSETS_DOMAIN = "http://kartkingdom-assets.pbskids.org/sprites/";
				}

				// Check if iframed in any of the virtual world environments
				// and reset domain and assets domain appropriately.
				// If not iframed, then leave default vw domain and assets domain.
				for( var i = 0 ; i < _VW_DOMAINS.length ; i++ ){
					var _m = (_isIframed ? document.referrer : window.location.href).match(_VW_DOMAINS[i]);
					if( _m ){
						_isVirtualWorld = true;
						_VW_DOMAIN = _m[0];
						_ASSETS_DOMAIN = _VW_DOMAIN + "/sprites";
						break;
					}
				}

				if( _isVirtualWorld || _isIframed ){
					// If playing within the virtual then
					// retrieve the user's data.
					// ---- OR ----
					// If iframed but failed to validate as in the
					// virtual world via referrer inspection then
					// try calling the virtual world via jsChannel.
					_validateKartKingdomAccess(true);
				}
				else{
					// If in virtual world or if logged-in to PBSKIDS.org,
					// then get the current user's virtual world info.
					if( _checkLogin() === true ){
						_validateKartKingdomAccess(false);
					}
					else{
						_complete();
					}
				}

				if(_DEBUG && PBS.KIDS.KartKingdom.cheator){
					_cheator = new PBS.KIDS.KartKingdom.cheator($, _that, gameID, _gameWrapper, _options);
				}

			} //_finalize()

			function _complete(){
				// Enable notifications ONLY if within the Virtual World or the producer opts-in to show notifications on their site.
				_notifications_enabled = _options.enable_notifications && (_isVirtualWorld || _options.enable_producer_notifications);

				_log("Is iframed         =", _isIframed);
				_log("Is VirtualWorld    =", _isVirtualWorld);
				_log("Has jsChannel      =", !!_vwChannel);
				_log("VW_DOMAIN          =", _VW_DOMAIN);
				_log("ASSETS_DOMAIN      =", _ASSETS_DOMAIN);
				_log("Show notifications =", _notifications_enabled);

				// Create css rules for reward icons
				var spriteQuality = "high"; //other possible values are "med" and "low"
				var rewardClassName = "dl.kartkingdom-rewards-list dd.kartkingdom-reward";

				var ajaxID = "ajax_" + (_ajaxID ++);
				_activeAjaxRequests[ajaxID] = $.ajax({
					url: _VW_DOMAIN + "/client/images/resources/resources_" + spriteQuality + ".json",
					complete: function(){
						delete _activeAjaxRequests[ajaxID];
					},
					success: function(response){
						var styles = rewardClassName + ' .kartkingdom-reward-icon{' +
												 '  background-image: url("' + _VW_DOMAIN + '/client/images/resources/' + response.meta.image + '");' +
												 '  background-size: ' + response.meta.size.w + '% ' + response.meta.size.h + '%;' +
												 '  line-height: 95px;'+
												 '  text-align: center;'+
												 '}';

						for (var f in response.frames ){
							styles += rewardClassName + '.' + f.replace(".png","").replace(spriteQuality + "_","") + ' .kartkingdom-reward-icon {' +
												' background-position: ' +
													(100 * response.frames[f].frame.x / (response.meta.size.w - response.frames[f].frame.w)) + '% ' +
													(100 * response.frames[f].frame.y / (response.meta.size.h - response.frames[f].frame.h)) + '%;' +
												'}';
						}

						$("<style/>").attr({"id" : "kartkingdom-minigame-api-rewards-css", "type" : "text/css"}).appendTo("head").html(styles);
					}
				});

				_dispatchEvent(PBS.KIDS.KartKingdom.minigameEvent.MINIGAME_READY, _onReadyPayload());
				_apiReady = true;
				_log("Minigame Ready |  player: ", _player);
			} //_complete()

			function _destroy(){
				// Abort all active ajax requests
				_log("Abort all active ajax requests and timeouts");
				for (var reqID in _activeAjaxRequests){
					_log("Abort " + reqID, _activeAjaxRequests[reqID]);
					_activeAjaxRequests[reqID].abort();
					delete _activeAjaxRequests[reqID];
				}

				// Clear any timeouts
				clearTimeout(_channelReadyTimeout);
				clearTimeout(_hideNotificationTimeout);

				// In case the api was destroyed immediately after construction:
				// Clear the queue for any listeners which were added before _gameWrapper was defined;
				_eventsToAdd = {};

				// Disable public methods
				_log("Disable public methods");
				for( var prop in _that ){
					if( _that.hasOwnProperty(prop) && typeof(_that[prop]) === "function" ){
						_that[prop] = function(){ return false; };
					}
				}

				// Remove all MinigameEvent listeners
				_log("Remove event listeners");
				_removeEventListener(PBS.KIDS.KartKingdom.minigameEvent.MINIGAME_READY);
				_removeEventListener(PBS.KIDS.KartKingdom.minigameEvent.LEVEL_COMPLETE_OPEN);
				_removeEventListener(PBS.KIDS.KartKingdom.minigameEvent.LEVEL_COMPLETE_CLOSED);
				_removeEventListener(PBS.KIDS.KartKingdom.minigameEvent.LEVEL_RESET);
				_removeEventListener(PBS.KIDS.KartKingdom.minigameEvent.RESOURCES_EARNED);
				_removeEventListener(PBS.KIDS.KartKingdom.minigameEvent.RESOURCE_REQUEST_COMPLETE);
				_removeEventListener(PBS.KIDS.KartKingdom.minigameEvent.POWERUP_CONSUMED);
				_removeEventListener(PBS.KIDS.KartKingdom.minigameEvent.POWERUP_CONSUME_FAILED);

				// Remove Listeners for PBSKIDS Login events
				target.$(document).off("org_pbskids_login_LoginEvent_LoggedIn", _onLoggedIn);
				target.$(document).off("org_pbskids_login_LoginEvent_LoggedOut", _checkLogin);
				if( target !== window ){
					window.$(document).off("org_pbskids_login_LoginEvent_LoggedIn", _onLoggedIn);
					window.$(document).off("org_pbskids_login_LoginEvent_LoggedOut", _checkLogin);
				}

				// Remove onResize event listeners
				$(target).off("resize", _onResizeRewardNotification);
				$(target).off("resize", _onResizeLeveCompleteScreen);

				// Destroy cheator
				if( _cheator ){
					_log("Destroy cheating dashboard");
					_cheator.destroy();
					_cheator = null;
				}

				// Destroy Avatar Animation
				if( _avatarAnim ){
					_log("Destroy Avatar Animation");
					_avatarAnim.destroy();
					_avatarAnim = null;
				}

				// Remove elements along with bound events and associated data
				_log("Destroy elements");
				$("#kartkingdom-level-complete-screen-wrapper").remove();
				$("#kartkingdom-reward-notification").remove();

				// Remove loaded dependencies
				_log("Remove dependencies");
				for( var i in _deps ){
					if( _deps[i].loaded === true ){
						_log(" -- Remove #" + _deps[i].id);
						$("#" + _deps[i].id).remove();
					}
				}

				// Remove css style tag written to document
				$("#kartkingdom-minigame-api-rewards-css").remove();

				// Null all the things!!!
				_log("Null all the things!!!");
				target = null;
				_that = null;
				_player = {};
				_vwChannel = null;
				_gameWrapper = null;
				_options = {};
				_resizeCarousel = false;
				_notifications_enabled = false;

				_log("API DESTROYED");
			} //_destroy()

			function _removeEventListener(type, listener){
				if(_gameWrapper){
					$(_gameWrapper).off(type, listener);
				}
			}

			function _addEventListener(type, listener){
				if (typeof listener !== "function"){
					return;
				}

				if( !_gameWrapper ){
					// Temp save eventlistener and add after _gameWrapper is defined
					_eventsToAdd[type] = listener;
					return;
				}

				if( type === PBS.KIDS.KartKingdom.minigameEvent.MINIGAME_READY && _apiReady ){
					var payload = _onReadyPayload();
					var e = $.Event(PBS.KIDS.KartKingdom.minigameEvent.MINIGAME_READY);
					for (var i in payload){
						e[i] = payload[i];
					}
					listener.call($(_gameWrapper), e);
				}

				$(_gameWrapper).off(type, listener);
				$(_gameWrapper).on(type, listener);
			}

			function _dispatchEvent(type, payload){
				type = (type || "").replace(/\./g, "_");

				switch( type ){
					
					case PBS.KIDS.KartKingdom.minigameEvent.MINIGAME_READY:
					case PBS.KIDS.KartKingdom.minigameEvent.LEVEL_COMPLETE_OPEN:
					case PBS.KIDS.KartKingdom.minigameEvent.LEVEL_COMPLETE_CLOSED:
					case PBS.KIDS.KartKingdom.minigameEvent.LEVEL_RESET:
					case PBS.KIDS.KartKingdom.minigameEvent.RESOURCES_EARNED:
					case PBS.KIDS.KartKingdom.minigameEvent.RESOURCE_REQUEST_COMPLETE:
					case PBS.KIDS.KartKingdom.minigameEvent.POWERUP_CONSUMED:
					case PBS.KIDS.KartKingdom.minigameEvent.POWERUP_CONSUME_FAILED:
						var e = $.Event(type); //build custom event object
						for (var i in payload){
							//add custom data to event object
							e[i] = payload[i];
						}
						$(_gameWrapper).trigger(e); //fire/dispatch/trigger custom event

						break;

					default:
						//do nothing
						return;
				} //end switch

			} //_dispatchEvent()

			function _onResizeRewardNotification(){
				_log("_onResizeRewardNotification()");

				_checkGameWidth(
					"#kartkingdom-reward-notification",
					[ 530, 500, 480, 440, 390 ]
				);
			} //_onResizeRewardNotification()

			function _onResizeLeveCompleteScreen(){
				_log("_onResizeLeveCompleteScreen()");

				_checkGameWidth(
					"#kartkingdom-level-complete-screen-wrapper",
					[ 852, 760, 690, 660, 590, 580, 520, 510, 500, 450, 410, 360, 340 ]
				);

				if( _resizeCarousel === true ){
					var carouselItems = "#kartkingdom-level-complete-screen .kartkingdom-rewards-list .kartkingdom-reward";
					var carouselWidth = $(carouselItems).outerWidth(true) * _player.rewards.length;

					_carouselList = "#kartkingdom-level-complete-screen .kartkingdom-rewards-list";
					_maskWidth = $("#kartkingdom-level-complete-screen .vw-background .rewards-carousel-masker").width();
					_scrollingBounds = {top:0, bottom:0, left: (_maskWidth - carouselWidth) , right:0};

					$(_carouselList).css({"width" : carouselWidth, "left" : 0});
					$("#kartkingdom-level-complete-screen .vw-background .rewards-carousel-nav-button.scroll-right").removeClass("disabled");
					$("#kartkingdom-level-complete-screen .vw-background .rewards-carousel-nav-button.scroll-left").addClass("disabled");
				}
			} //_onResizeLeveCompleteScreen()

			function _checkGameWidth(wrapper, breakpoints){
				if( $(wrapper).length === 0 ){
					return;
				}

				//remove any previously added width-based classes
				$(wrapper).removeClass("w-" + breakpoints.join(" w-"));
				for( var i = 0 ; i < breakpoints.length ; i++ ){
					//add width-based class if less than or equal to break-point width
					if( $(_gameWrapper).innerWidth() <= breakpoints[i] ){
						$(wrapper).addClass("w-" + breakpoints[i]);
					}
					else{
						break;
					}
				}
			} //_checkGameWidth()

			function _onReadyPayload(){
				return {
					"is_logged_in": Boolean(_player.id || _player.user),
					"has_played_virtual_world": Boolean(_player.user)
				};
			}

			function _validateGame(){
				if (!gameID) {
					return {
						"success": false,
						"message": "GUID for the Minigame was not provided."
					};
				}

				else if (!elementID || !target.document.getElementById(elementID)) {
					return {
						"success": false,
						"message": "An ID for the element containing/wrapping the game must be provided."
					};
				}

				else if (!pauseFunc || typeof pauseFunc !== "function") {
					return {
						"success": false,
						"message": "A method of pausing the game MUST be provided."
					};
				}

				else if (!unPauseFunc || typeof unPauseFunc !== "function") {
					return {
						"success": false,
						"message": "A method of unpausing/resuming the game MUST be provided."
					};
				}

				else {
					return {
						"success": true,
						"message": "success"
					};
				}
			} //_validateGame()

			function _getPowerups(onCompleteCallback, args){
				_log("Get Powerups");

				var ajaxID = "ajax_" + (_ajaxID ++);
				_activeAjaxRequests[ajaxID] = $.ajax({
					url: _VW_DOMAIN + "/api/avatars/" + _player.user.avatar_id + "/inventories.nexus",
					complete: function(){
						delete _activeAjaxRequests[ajaxID];
					},
					error: function(){
						onCompleteCallback.apply(this, args);
					},
					success: function(response){
						_log("User Validated :: onLoadedInventories(), response = ", response);

						if (response.packet && response.packet.products && response.packet.inventory){
							// collect quantity of all inventory items
							var __inventory = {};
							for (var j in response.packet.inventory){
								__inventory[response.packet.inventory[j].product_id] = response.packet.inventory[j].quantity;
							}

							// collect powerups and store items as key-value pairs where the powerup identifier
							// is the key and the quantity stored in the __inventory object is the value.
							for (var i in response.packet.products){
								if (response.packet.products[i].type && response.packet.products[i].type.toLowerCase() === "backpack"){
									_player.powerups[response.packet.products[i].identifier] = {
										id: response.packet.products[i].id,
										quantity: __inventory[response.packet.products[i].id]
									};
								}
							}

							if( _player.powerups !== {} ){
								// if powerups were found then get the difference in resources
								// and powerups since last login and update quantities.
								var ajaxID_sub = "ajax_" + (_ajaxID ++);
								_activeAjaxRequests[ajaxID_sub] = $.ajax({
									url: _REWARDS_API,
									complete: function(){
										delete _activeAjaxRequests[ajaxID_sub];
									},
									error: function(){
										onCompleteCallback.apply(this, args);
									},
									success: function(response){
										for (var i in _player.powerups){
											_log("Player Powerup : " + i + " (Gross) = " + _player.powerups[i].quantity);
											if (response[i]){
												_player.powerups[i].quantity += response[i];
											}
											_log("Player Powerup : " + i + " (Net) = " + _player.powerups[i].quantity);
										}
										onCompleteCallback.apply(this, args);
									}
								});
							}
							else{
								_log("Player has no powerups, ", _player.powerups);
								onCompleteCallback.apply(this, args);
							}
						}
						else{
							onCompleteCallback.apply(this, args);
						}
					}
				});
			} //_getPowerups()

			function _getUnlockedPowerups(onCompleteCallback, args){
				var ajaxID = "ajax_" + (_ajaxID ++);
				_activeAjaxRequests[ajaxID] = $.ajax({
					url: _VW_DOMAIN + "/api/avatars/" + _player.user.avatar_id + "/persistent_objects.nexus",
					complete: function(){
						delete _activeAjaxRequests[ajaxID];
					},
					error: function(){
						onCompleteCallback.apply(this, args);
					},
					success: function(response){
						_log("Get Unlocked Powerups :: success(), response = ", response);
						if (response.packet && response.packet && response.status === 200){
							for (var i in response.packet){
								if (response.packet[i].id && response.packet[i].id.match("session.crafting.unlockedProducts.") && response.packet[i].unlockedRecipe === true){
									var _unlockedPowerup = response.packet[i].id.substring(response.packet[i].id.lastIndexOf(".") + 1);
									_log("Unlocked Powerup: " + _unlockedPowerup);

									if (!_player.powerups[_unlockedPowerup]){
										_player.powerups[_unlockedPowerup] = { quantity: 0 };
									}
								}
							}
							onCompleteCallback.apply(this, args);
						}
						else{
							onCompleteCallback.apply(this, args);
						}
					}
				});
			} //_getUnlockedPowerups()

			function _userValidated(user, avatar, powerups){
				_log("User Validated");

				_player.user = user;
				_player.avatar = avatar;
				_player.powerups = powerups || {};
				_player.rewards = { length: 0 };

				if (_isVirtualWorld || powerups){
					_complete(); //Done
				}
				else{
					// If not in virtual world, then collect previously CRAFTED powerups from nexus server
					_getPowerups( // 1) Get currently available powerups and quantities
						_getUnlockedPowerups, // 2) Get previously unlocked but depleted powerups
						[
							_complete // 3) Done!
						]
					);
				}
			} //_userValidated()

			function _onLoggedIn(e){
				//_log("Login Event:", e);
				_player.id = e.user.id;
				_player.name = e.user.name;
				_validateKartKingdomAccess(false);
			} //_onLoggedIn()

			function _checkLogin(){
				_log("Check Login Status");
				var username = _getCookie("pbskids.username");
				var userid = _getCookie("pbskids.userid");
				if (username && userid){
					_player.id = userid;
					_player.name = username;
					_log("Player Is Logged In");
					return true;
				}
				else{
					_player = {};
					_log("Player Is Not Logged In");
					return false;
				}
			} //_checkLogin()

			function _validateKartKingdomAccess(checkVirtualWorld){
				_log("ValidateKartKingdomAccess(): checkVirtualWorld = ", checkVirtualWorld);

				if (checkVirtualWorld){
					// if in virtual world then grab user data via jschannel
					var __timeoutDelay = 2000; //2 seconds
					var __onChannelReady = function(){
						clearTimeout(_channelReadyTimeout);

						_log("Minigame Channel Ready");

						_vwChannel.call({
							method: "getUserData",
							params: {},
							timeout: 1000,
							success: function(response){
								_log("Channel.getUserData() ::  response = ", response);
								_isVirtualWorld = true;
								if (response.webServiceUrl){
									_VW_DOMAIN = response.webServiceUrl;
									_log("Updated _VW_DOMAIN: ", _VW_DOMAIN);
								}
								if (response.avatarBakerURL){
									_ASSETS_DOMAIN = response.avatarBakerURL;
									_log("Updated _ASSETS_DOMAIN: ", _ASSETS_DOMAIN);
								}
								_userValidated(response.user, response.avatar, response.powerups);
							},
							error: function(response){
								if (!_isVirtualWorld){
									_log("Channel.getUserData() failed. Not in virtual world. Get userdata via PBSKIDS login. ");
									_validateKartKingdomAccess(false);
								}
								else{
									_log("Channel.getUserData() failed. User is in the virtual world but could NOT retrieve user data", response, "error");
								}
							}
						});
					}; //__onChannelReady()

					if (!_vwChannel){
						_vwChannel = _deps.Channel.lib.build({
							// Setup and config jsChannel
							window: window.parent,
							origin: "*",
							scope: "minigame",
							onReady: __onChannelReady
						}); //.build()

						// Allow the kart kingdom shell/app to pause or unpause the game at will
						_vwChannel.bind('pauseGame', pauseFunc);
						_vwChannel.bind('unpauseGame', unPauseFunc);

						// timeout check just in case onReady is missed due to race-condition
						// OPEN ISSUE, "ready message has a race condition #26" | https://github.com/mozilla/jschannel/issues/26
						_channelReadyTimeout = setTimeout(__onChannelReady, __timeoutDelay);
					}
					else{
						__onChannelReady();
					}

				}
				else if (_checkLogin()){
					// if not in virtual world then grab user info via the pbskids_userid
					var ajaxID = "ajax_" + (_ajaxID ++);
					_activeAjaxRequests[ajaxID] = $.ajax({
						url: _VW_DOMAIN + "/api/pbs/" + _player.id + "/avatars.nexus",
						error: _complete,
						complete: function(){
							delete _activeAjaxRequests[ajaxID];
						},
						success: function(response){
							_log("ValidateKartKingdomAccess :: loaded avatars.nexus :: response = ", response);
							if (response.packet && response.packet.user && response.packet.user.id){
								response.packet.user.avatar_id = response.packet.avatars[0].id;
								_userValidated(response.packet.user, response.packet.avatars[0].layers);
							}
							else{
								_log("ValidateKartKingdomAccess :: User is logged in, but does not have virtual world access.", response);
								_complete(); //done
							}
						}
					});
				}
				else{
					_log("ValidateKartKingdomAccess :: User is not logged in.");
					_complete(); //done
				}

			} //_validateKartKingdomAccess()

			function _loadDependencies(onCompleteCallback){
				//Setup local jQuery v@1.8.0 jquery.com | jquery.org/license
				
				$ = function(a, b) {function E(a) {var b = D[a] = {}; return n.each(a.split(q), function(a, c) {b[c] = !0 }), b; } function H(a, c, d) {if (d === b && 1 === a.nodeType) {var e = "data-" + c.replace(G, "-$1").toLowerCase(); if (d = a.getAttribute(e), "string" == typeof d) {try {d = "true" === d ? !0 : "false" === d ? !1 : "null" === d ? null : +d + "" === d ? +d : F.test(d) ? n.parseJSON(d) : d; } catch (f) {} n.data(a, c, d); } else d = b; } return d; } function I(a) {var b; for (b in a) if (("data" !== b || !n.isEmptyObject(a[b])) && "toJSON" !== b) return !1; return !0 } function $() {return !1 } function _() {return !0 } function fb(a) {return !a || !a.parentNode || 11 === a.parentNode.nodeType } function gb(a, b) {do a = a[b]; while (a && 1 !== a.nodeType); return a } function hb(a, b, c) {if (b = b || 0, n.isFunction(b)) return n.grep(a, function(a, d) {var e = !!b.call(a, d, a); return e === c }); if (b.nodeType) return n.grep(a, function(a) {return a === b === c }); if ("string" == typeof b) {var d = n.grep(a, function(a) {return 1 === a.nodeType }); if (cb.test(b)) return n.filter(b, d, !c); b = n.filter(b, d) } return n.grep(a, function(a) {return n.inArray(a, b) >= 0 === c }) } function ib(a) {var b = jb.split("|"), c = a.createDocumentFragment(); if (c.createElement) for (; b.length;) c.createElement(b.pop()); return c } function Ab(a, b) {return a.getElementsByTagName(b)[0] || a.appendChild(a.ownerDocument.createElement(b)) } function Bb(a, b) {if (1 === b.nodeType && n.hasData(a)) {var c, d, e, f = n._data(a), g = n._data(b, f), h = f.events; if (h) {delete g.handle, g.events = {}; for (c in h) for (d = 0, e = h[c].length; e > d; d++) n.event.add(b, c, h[c][d]) } g.data && (g.data = n.extend({}, g.data)) } } function Cb(a, b) {var c; 1 === b.nodeType && (b.clearAttributes && b.clearAttributes(), b.mergeAttributes && b.mergeAttributes(a), c = b.nodeName.toLowerCase(), "object" === c ? (b.parentNode && (b.outerHTML = a.outerHTML), n.support.html5Clone && a.innerHTML && !n.trim(b.innerHTML) && (b.innerHTML = a.innerHTML)) : "input" === c && tb.test(a.type) ? (b.defaultChecked = b.checked = a.checked, b.value !== a.value && (b.value = a.value)) : "option" === c ? b.selected = a.defaultSelected : "input" === c || "textarea" === c ? b.defaultValue = a.defaultValue : "script" === c && b.text !== a.text && (b.text = a.text), b.removeAttribute(n.expando)) } function Db(a) {return "undefined" != typeof a.getElementsByTagName ? a.getElementsByTagName("*") : "undefined" != typeof a.querySelectorAll ? a.querySelectorAll("*") : [] } function Eb(a) {tb.test(a.type) && (a.defaultChecked = a.checked) } function Vb(a, b) {if (b in a) return b; for (var c = b.charAt(0).toUpperCase() + b.slice(1), d = b, e = Tb.length; e--;) if (b = Tb[e] + c, b in a) return b; return d } function Wb(a, b) {return a = b || a, "none" === n.css(a, "display") || !n.contains(a.ownerDocument, a) } function Xb(a, b) {for (var c, d, e = [], f = 0, g = a.length; g > f; f++) c = a[f], c.style && (e[f] = n._data(c, "olddisplay"), b ? (e[f] || "none" !== c.style.display || (c.style.display = ""), "" === c.style.display && Wb(c) && (e[f] = n._data(c, "olddisplay", _b(c.nodeName)))) : (d = Fb(c, "display"), e[f] || "none" === d || n._data(c, "olddisplay", d))); for (f = 0; g > f; f++) c = a[f], c.style && (b && "none" !== c.style.display && "" !== c.style.display || (c.style.display = b ? e[f] || "" : "none")); return a } function Yb(a, b, c) {var d = Mb.exec(b); return d ? Math.max(0, d[1] - (c || 0)) + (d[2] || "px") : b } function Zb(a, b, c, d) {for (var e = c === (d ? "border" : "content") ? 4 : "width" === b ? 1 : 0, f = 0; 4 > e; e += 2) "margin" === c && (f += n.css(a, c + Sb[e], !0)), d ? ("content" === c && (f -= parseFloat(Fb(a, "padding" + Sb[e])) || 0), "margin" !== c && (f -= parseFloat(Fb(a, "border" + Sb[e] + "Width")) || 0)) : (f += parseFloat(Fb(a, "padding" + Sb[e])) || 0, "padding" !== c && (f += parseFloat(Fb(a, "border" + Sb[e] + "Width")) || 0)); return f } function $b(a, b, c) {var d = "width" === b ? a.offsetWidth : a.offsetHeight, e = !0, f = n.support.boxSizing && "border-box" === n.css(a, "boxSizing"); if (0 >= d) {if (d = Fb(a, b), (0 > d || null == d) && (d = a.style[b]), Nb.test(d)) return d; e = f && (n.support.boxSizingReliable || d === a.style[b]), d = parseFloat(d) || 0 } return d + Zb(a, b, c || (f ? "border" : "content"), e) + "px"} function _b(a) {if (Pb[a]) return Pb[a]; var b = n("<" + a + ">").appendTo(e.body), c = b.css("display"); return b.remove(), ("none" === c || "" === c) && (Gb = e.body.appendChild(Gb || n.extend(e.createElement("iframe"), {frameBorder: 0, width: 0, height: 0 })), Hb && Gb.createElement || (Hb = (Gb.contentWindow || Gb.contentDocument).document, Hb.write("<!doctype html><html><body>"), Hb.close()), b = Hb.body.appendChild(Hb.createElement(a)), c = Fb(b, "display"), e.body.removeChild(Gb)), Pb[a] = c, c } function fc(a, b, c, d) {var e; if (n.isArray(b)) n.each(b, function(b, e) {c || bc.test(a) ? d(a, e) : fc(a + "[" + ("object" == typeof e ? b : "") + "]", e, c, d) }); else if (c || "object" !== n.type(b)) d(a, b); else for (e in b) fc(a + "[" + e + "]", b[e], c, d) } function wc(a) {return function(b, c) {"string" != typeof b && (c = b, b = "*"); var d, e, f, g = b.toLowerCase().split(q), h = 0, i = g.length; if (n.isFunction(c)) for (; i > h; h++) d = g[h], f = /^\+/.test(d), f && (d = d.substr(1) || "*"), e = a[d] = a[d] || [], e[f ? "unshift" : "push"](c) } } function xc(a, c, d, e, f, g) {f = f || c.dataTypes[0], g = g || {}, g[f] = !0; for (var h, i = a[f], j = 0, k = i ? i.length : 0, l = a === sc; k > j && (l || !h); j++) h = i[j](c, d, e), "string" == typeof h && (!l || g[h] ? h = b : (c.dataTypes.unshift(h), h = xc(a, c, d, e, h, g))); return !l && h || g["*"] || (h = xc(a, c, d, e, "*", g)), h } function yc(a, c) {var d, e, f = n.ajaxSettings.flatOptions || {}; for (d in c) c[d] !== b && ((f[d] ? a : e || (e = {}))[d] = c[d]); e && n.extend(!0, a, e) } function zc(a, c, d) {var e, f, g, h, i = a.contents, j = a.dataTypes, k = a.responseFields; for (f in k) f in d && (c[k[f]] = d[f]); for (; "*" === j[0];) j.shift(), e === b && (e = a.mimeType || c.getResponseHeader("content-type")); if (e) for (f in i) if (i[f] && i[f].test(e)) {j.unshift(f); break } if (j[0] in d) g = j[0]; else {for (f in d) {if (!j[0] || a.converters[f + " " + j[0]]) {g = f; break } h || (h = f) } g = g || h } return g ? (g !== j[0] && j.unshift(g), d[g]) : void 0 } function Ac(a, b) {var c, d, e, f, g = a.dataTypes.slice(), h = g[0], i = {}, j = 0; if (a.dataFilter && (b = a.dataFilter(b, a.dataType)), g[1]) for (c in a.converters) i[c.toLowerCase()] = a.converters[c]; for (; e = g[++j];) if ("*" !== e) {if ("*" !== h && h !== e) {if (c = i[h + " " + e] || i["* " + e], !c) for (d in i) if (f = d.split(" "), f[1] === e && (c = i[h + " " + f[0]] || i["* " + f[0]])) {c === !0 ? c = i[d] : i[d] !== !0 && (e = f[0], g.splice(j--, 0, e)); break } if (c !== !0) if (c && a["throws"]) b = c(b); else try {b = c(b) } catch (k) {return {state: "parsererror", error: c ? k : "No conversion from " + h + " to " + e } } } h = e } return {state: "success", data: b } } function Ic() {try {return new a.XMLHttpRequest } catch (b) {} } function Jc() {try {return new a.ActiveXObject("Microsoft.XMLHTTP") } catch (b) {} } function Rc() {return setTimeout(function() {Kc = b }, 0), Kc = n.now() } function Sc(a, b) {n.each(b, function(b, c) {for (var d = (Qc[b] || []).concat(Qc["*"]), e = 0, f = d.length; f > e; e++) if (d[e].call(a, b, c)) return }) } function Tc(a, b, c) {var d, e = 0, g = Pc.length, h = n.Deferred().always(function() {delete i.elem }), i = function() {for (var b = Kc || Rc(), c = Math.max(0, j.startTime + j.duration - b), d = 1 - (c / j.duration || 0), e = 0, f = j.tweens.length; f > e; e++) j.tweens[e].run(d); return h.notifyWith(a, [j, d, c]), 1 > d && f ? c : (h.resolveWith(a, [j]), !1) }, j = h.promise({elem: a, props: n.extend({}, b), opts: n.extend(!0, {specialEasing: {} }, c), originalProperties: b, originalOptions: c, startTime: Kc || Rc(), duration: c.duration, tweens: [], createTween: function(b, c) {var e = n.Tween(a, j.opts, b, c, j.opts.specialEasing[b] || j.opts.easing); return j.tweens.push(e), e }, stop: function(b) {for (var c = 0, d = b ? j.tweens.length : 0; d > c; c++) j.tweens[c].run(1); return b ? h.resolveWith(a, [j, b]) : h.rejectWith(a, [j, b]), this } }), k = j.props; for (Uc(k, j.opts.specialEasing); g > e; e++) if (d = Pc[e].call(j, a, k, j.opts)) return d; return Sc(j, k), n.isFunction(j.opts.start) && j.opts.start.call(a, j), n.fx.timer(n.extend(i, {anim: j, queue: j.opts.queue, elem: a })), j.progress(j.opts.progress).done(j.opts.done, j.opts.complete).fail(j.opts.fail).always(j.opts.always) } function Uc(a, b) {var c, d, e, f, g; for (c in a) if (d = n.camelCase(c), e = b[d], f = a[c], n.isArray(f) && (e = f[1], f = a[c] = f[0]), c !== d && (a[d] = f, delete a[c]), g = n.cssHooks[d], g && "expand" in g) {f = g.expand(f), delete a[d]; for (c in f) c in a || (a[c] = f[c], b[c] = e) } else b[d] = e } function Vc(a, b, c) {var d, e, f, g, h, i, j, k, l = this, m = a.style, o = {}, p = [], q = a.nodeType && Wb(a); c.queue || (j = n._queueHooks(a, "fx"), null == j.unqueued && (j.unqueued = 0, k = j.empty.fire, j.empty.fire = function() {j.unqueued || k() }), j.unqueued++, l.always(function() {l.always(function() {j.unqueued--, n.queue(a, "fx").length || j.empty.fire() }) })), 1 === a.nodeType && ("height" in b || "width" in b) && (c.overflow = [m.overflow, m.overflowX, m.overflowY], "inline" === n.css(a, "display") && "none" === n.css(a, "float") && (n.support.inlineBlockNeedsLayout && "inline" !== _b(a.nodeName) ? m.zoom = 1 : m.display = "inline-block")), c.overflow && (m.overflow = "hidden", n.support.shrinkWrapBlocks || l.done(function() {m.overflow = c.overflow[0], m.overflowX = c.overflow[1], m.overflowY = c.overflow[2] })); for (d in b) if (f = b[d], Mc.exec(f)) {if (delete b[d], f === (q ? "hide" : "show")) continue; p.push(d) } if (g = p.length) for (h = n._data(a, "fxshow") || n._data(a, "fxshow", {}), q ? n(a).show() : l.done(function() {n(a).hide() }), l.done(function() {var b; n.removeData(a, "fxshow", !0); for (b in o) n.style(a, b, o[b]) }), d = 0; g > d; d++) e = p[d], i = l.createTween(e, q ? h[e] : 0), o[e] = h[e] || n.style(a, e), e in h || (h[e] = i.start, q && (i.end = i.start, i.start = "width" === e || "height" === e ? 1 : 0)) } function Wc(a, b, c, d, e) {return new Wc.prototype.init(a, b, c, d, e) } function Xc(a, b) {for (var c, d = {height: a }, e = 0; 4 > e; e += 2 - b) c = Sb[e], d["margin" + c] = d["padding" + c] = a; return b && (d.opacity = d.width = a), d } function Zc(a) {return n.isWindow(a) ? a : 9 === a.nodeType ? a.defaultView || a.parentWindow : !1 } var c, d, e = a.document, f = a.location, g = a.navigator, h = Array.prototype.push, i = Array.prototype.slice, j = Array.prototype.indexOf, k = Object.prototype.toString, l = Object.prototype.hasOwnProperty, m = String.prototype.trim, n = function(a, b) {return new n.fn.init(a, b, c) }, o = /[\-+]?(?:\d*\.|)\d+(?:[eE][\-+]?\d+|)/.source, p = /\S/, q = /\s+/, r = p.test("\xa0") ? /^[\s\xA0]+|[\s\xA0]+$/g : /^\s+|\s+$/g, s = /^(?:[^#<]*(<[\w\W]+>)[^>]*$|#([\w\-]*)$)/, t = /^<(\w+)\s*\/?>(?:<\/\1>|)$/, u = /^[\],:{}\s]*$/, v = /(?:^|:|,)(?:\s*\[)+/g, w = /\\(?:["\\\/bfnrt]|u[\da-fA-F]{4})/g, x = /"[^"\\\r\n]*"|true|false|null|-?(?:\d\d*\.|)\d+(?:[eE][\-+]?\d+|)/g, y = /^-ms-/, z = /-([\da-z])/gi, A = function(a, b) {return (b + "").toUpperCase() }, B = function() {e.addEventListener ? (e.removeEventListener("DOMContentLoaded", B, !1), n.ready()) : "complete" === e.readyState && (e.detachEvent("onreadystatechange", B), n.ready()) }, C = {}; n.fn = n.prototype = {constructor: n, init: function(a, c, d) {var f, g, i; if (!a) return this; if (a.nodeType) return this.context = this[0] = a, this.length = 1, this; if ("string" == typeof a) {if (f = "<" === a.charAt(0) && ">" === a.charAt(a.length - 1) && a.length >= 3 ? [null, a, null] : s.exec(a), !f || !f[1] && c) return !c || c.jquery ? (c || d).find(a) : this.constructor(c).find(a); if (f[1]) return c = c instanceof n ? c[0] : c, i = c && c.nodeType ? c.ownerDocument || c : e, a = n.parseHTML(f[1], i, !0), t.test(f[1]) && n.isPlainObject(c) && this.attr.call(a, c, !0), n.merge(this, a); if (g = e.getElementById(f[2]), g && g.parentNode) {if (g.id !== f[2]) return d.find(a); this.length = 1, this[0] = g } return this.context = e, this.selector = a, this } return n.isFunction(a) ? d.ready(a) : (a.selector !== b && (this.selector = a.selector, this.context = a.context), n.makeArray(a, this)) }, selector: "", jquery: "1.8.0", length: 0, size: function() {return this.length }, toArray: function() {return i.call(this) }, get: function(a) {return null == a ? this.toArray() : 0 > a ? this[this.length + a] : this[a] }, pushStack: function(a, b, c) {var d = n.merge(this.constructor(), a); return d.prevObject = this, d.context = this.context, "find" === b ? d.selector = this.selector + (this.selector ? " " : "") + c : b && (d.selector = this.selector + "." + b + "(" + c + ")"), d }, each: function(a, b) {return n.each(this, a, b) }, ready: function(a) {return n.ready.promise().done(a), this }, eq: function(a) {return a = +a, -1 === a ? this.slice(a) : this.slice(a, a + 1) }, first: function() {return this.eq(0) }, last: function() {return this.eq(-1) }, slice: function() {return this.pushStack(i.apply(this, arguments), "slice", i.call(arguments).join(",")) }, map: function(a) {return this.pushStack(n.map(this, function(b, c) {return a.call(b, c, b) })) }, end: function() {return this.prevObject || this.constructor(null) }, push: h, sort: [].sort, splice: [].splice }, n.fn.init.prototype = n.fn, n.extend = n.fn.extend = function() {var a, c, d, e, f, g, h = arguments[0] || {}, i = 1, j = arguments.length, k = !1; for ("boolean" == typeof h && (k = h, h = arguments[1] || {}, i = 2), "object" == typeof h || n.isFunction(h) || (h = {}), j === i && (h = this, --i); j > i; i++) if (null != (a = arguments[i])) for (c in a) d = h[c], e = a[c], h !== e && (k && e && (n.isPlainObject(e) || (f = n.isArray(e))) ? (f ? (f = !1, g = d && n.isArray(d) ? d : []) : g = d && n.isPlainObject(d) ? d : {}, h[c] = n.extend(k, g, e)) : e !== b && (h[c] = e)); return h }, n.extend({noConflict: function() {return n }, isReady: !1, readyWait: 1, holdReady: function(a) {a ? n.readyWait++ : n.ready(!0) }, ready: function(a) {if (a === !0 ? !--n.readyWait : !n.isReady) {if (!e.body) return setTimeout(n.ready, 1); n.isReady = !0, a !== !0 && --n.readyWait > 0 || (d.resolveWith(e, [n]), n.fn.trigger && n(e).trigger("ready").off("ready")) } }, isFunction: function(a) {return "function" === n.type(a) }, isArray: Array.isArray || function(a) {return "array" === n.type(a) }, isWindow: function(a) {return null != a && a == a.window }, isNumeric: function(a) {return !isNaN(parseFloat(a)) && isFinite(a) }, type: function(a) {return null == a ? String(a) : C[k.call(a)] || "object"}, isPlainObject: function(a) {if (!a || "object" !== n.type(a) || a.nodeType || n.isWindow(a)) return !1; try {if (a.constructor && !l.call(a, "constructor") && !l.call(a.constructor.prototype, "isPrototypeOf")) return !1 } catch (c) {return !1 } var d; for (d in a); return d === b || l.call(a, d) }, isEmptyObject: function(a) {var b; for (b in a) return !1; return !0 }, error: function(a) {throw new Error(a) }, parseHTML: function(a, b, c) {var d; return a && "string" == typeof a ? ("boolean" == typeof b && (c = b, b = 0), b = b || e, (d = t.exec(a)) ? [b.createElement(d[1])] : (d = n.buildFragment([a], b, c ? null : []), n.merge([], (d.cacheable ? n.clone(d.fragment) : d.fragment).childNodes))) : null }, parseJSON: function(b) {return b && "string" == typeof b ? (b = n.trim(b), a.JSON && a.JSON.parse ? a.JSON.parse(b) : u.test(b.replace(w, "@").replace(x, "]").replace(v, "")) ? new Function("return " + b)() : (n.error("Invalid JSON: " + b), void 0)) : null }, parseXML: function(c) {var d, e; if (!c || "string" != typeof c) return null; try {a.DOMParser ? (e = new DOMParser, d = e.parseFromString(c, "text/xml")) : (d = new ActiveXObject("Microsoft.XMLDOM"), d.async = "false", d.loadXML(c)) } catch (f) {d = b } return d && d.documentElement && !d.getElementsByTagName("parsererror").length || n.error("Invalid XML: " + c), d }, noop: function() {}, globalEval: function(b) {b && p.test(b) && (a.execScript || function(b) {a.eval.call(a, b) })(b) }, camelCase: function(a) {return a.replace(y, "ms-").replace(z, A) }, nodeName: function(a, b) {return a.nodeName && a.nodeName.toUpperCase() === b.toUpperCase() }, each: function(a, c, d) {var e, f = 0, g = a.length, h = g === b || n.isFunction(a); if (d) if (h) {for (e in a) if (c.apply(a[e], d) === !1) break } else for (; g > f && c.apply(a[f++], d) !== !1;); else if (h) {for (e in a) if (c.call(a[e], e, a[e]) === !1) break } else for (; g > f && c.call(a[f], f, a[f++]) !== !1;); return a }, trim: m ? function(a) {return null == a ? "" : m.call(a) } : function(a) {return null == a ? "" : a.toString().replace(r, "") }, makeArray: function(a, b) {var c, d = b || []; return null != a && (c = n.type(a), null == a.length || "string" === c || "function" === c || "regexp" === c || n.isWindow(a) ? h.call(d, a) : n.merge(d, a)), d }, inArray: function(a, b, c) {var d; if (b) {if (j) return j.call(b, a, c); for (d = b.length, c = c ? 0 > c ? Math.max(0, d + c) : c : 0; d > c; c++) if (c in b && b[c] === a) return c } return -1 }, merge: function(a, c) {var d = c.length, e = a.length, f = 0; if ("number" == typeof d) for (; d > f; f++) a[e++] = c[f]; else for (; c[f] !== b;) a[e++] = c[f++]; return a.length = e, a }, grep: function(a, b, c) {var d, e = [], f = 0, g = a.length; for (c = !!c; g > f; f++) d = !!b(a[f], f), c !== d && e.push(a[f]); return e }, map: function(a, c, d) {var e, f, g = [], h = 0, i = a.length, j = a instanceof n || i !== b && "number" == typeof i && (i > 0 && a[0] && a[i - 1] || 0 === i || n.isArray(a)); if (j) for (; i > h; h++) e = c(a[h], h, d), null != e && (g[g.length] = e); else for (f in a) e = c(a[f], f, d), null != e && (g[g.length] = e); return g.concat.apply([], g) }, guid: 1, proxy: function(a, c) {var d, e, f; return "string" == typeof c && (d = a[c], c = a, a = d), n.isFunction(a) ? (e = i.call(arguments, 2), f = function() {return a.apply(c, e.concat(i.call(arguments))) }, f.guid = a.guid = a.guid || f.guid || n.guid++, f) : b }, access: function(a, c, d, e, f, g, h) {var i, j = null == d, k = 0, l = a.length; if (d && "object" == typeof d) {for (k in d) n.access(a, c, k, d[k], 1, g, e); f = 1 } else if (e !== b) {if (i = h === b && n.isFunction(e), j && (i ? (i = c, c = function(a, b, c) {return i.call(n(a), c) }) : (c.call(a, e), c = null)), c) for (; l > k; k++) c(a[k], d, i ? e.call(a[k], k, c(a[k], d)) : e, h); f = 1 } return f ? a : j ? c.call(a) : l ? c(a[0], d) : g }, now: function() {return (new Date).getTime() } }), n.ready.promise = function(b) {if (!d) if (d = n.Deferred(), "complete" === e.readyState || "loading" !== e.readyState && e.addEventListener) setTimeout(n.ready, 1); else if (e.addEventListener) e.addEventListener("DOMContentLoaded", B, !1), a.addEventListener("load", n.ready, !1); else {e.attachEvent("onreadystatechange", B), a.attachEvent("onload", n.ready); var c = !1; try {c = null == a.frameElement && e.documentElement } catch (f) {} c && c.doScroll && function g() {if (!n.isReady) {try {c.doScroll("left") } catch (a) {return setTimeout(g, 50) } n.ready() } }() } return d.promise(b) }, n.each("Boolean Number String Function Array Date RegExp Object".split(" "), function(a, b) {C["[object " + b + "]"] = b.toLowerCase() }), c = n(e); var D = {}; n.Callbacks = function(a) {a = "string" == typeof a ? D[a] || E(a) : n.extend({}, a); var c, d, e, f, g, h, i = [], j = !a.once && [], k = function(b) {for (c = a.memory && b, d = !0, h = f || 0, f = 0, g = i.length, e = !0; i && g > h; h++) if (i[h].apply(b[0], b[1]) === !1 && a.stopOnFalse) {c = !1; break } e = !1, i && (j ? j.length && k(j.shift()) : c ? i = [] : l.disable()) }, l = {add: function() {if (i) {var b = i.length; ! function d(b) {n.each(b, function(b, c) {!n.isFunction(c) || a.unique && l.has(c) ? c && c.length && d(c) : i.push(c) }) }(arguments), e ? g = i.length : c && (f = b, k(c)) } return this }, remove: function() {return i && n.each(arguments, function(a, b) {for (var c; (c = n.inArray(b, i, c)) > -1;) i.splice(c, 1), e && (g >= c && g--, h >= c && h--) }), this }, has: function(a) {return n.inArray(a, i) > -1 }, empty: function() {return i = [], this }, disable: function() {return i = j = c = b, this }, disabled: function() {return !i }, lock: function() {return j = b, c || l.disable(), this }, locked: function() {return !j }, fireWith: function(a, b) {return b = b || [], b = [a, b.slice ? b.slice() : b], !i || d && !j || (e ? j.push(b) : k(b)), this }, fire: function() {return l.fireWith(this, arguments), this }, fired: function() {return !!d } }; return l }, n.extend({Deferred: function(a) {var b = [["resolve", "done", n.Callbacks("once memory"), "resolved"], ["reject", "fail", n.Callbacks("once memory"), "rejected"], ["notify", "progress", n.Callbacks("memory")] ], c = "pending", d = {state: function() {return c }, always: function() {return e.done(arguments).fail(arguments), this }, then: function() {var a = arguments; return n.Deferred(function(c) {n.each(b, function(b, d) {var f = d[0], g = a[b]; e[d[1]](n.isFunction(g) ? function() {var a = g.apply(this, arguments); a && n.isFunction(a.promise) ? a.promise().done(c.resolve).fail(c.reject).progress(c.notify) : c[f + "With"](this === e ? c : this, [a]) } : c[f]) }), a = null }).promise() }, promise: function(a) {return "object" == typeof a ? n.extend(a, d) : d } }, e = {}; return d.pipe = d.then, n.each(b, function(a, f) {var g = f[2], h = f[3]; d[f[1]] = g.add, h && g.add(function() {c = h }, b[1 ^ a][2].disable, b[2][2].lock), e[f[0]] = g.fire, e[f[0] + "With"] = g.fireWith }), d.promise(e), a && a.call(e, e), e }, when: function(a) {var h, j, k, b = 0, c = i.call(arguments), d = c.length, e = 1 !== d || a && n.isFunction(a.promise) ? d : 0, f = 1 === e ? a : n.Deferred(), g = function(a, b, c) {return function(d) {b[a] = this, c[a] = arguments.length > 1 ? i.call(arguments) : d, c === h ? f.notifyWith(b, c) : --e || f.resolveWith(b, c) } }; if (d > 1) for (h = new Array(d), j = new Array(d), k = new Array(d); d > b; b++) c[b] && n.isFunction(c[b].promise) ? c[b].promise().done(g(b, k, c)).fail(f.reject).progress(g(b, j, h)) : --e; return e || f.resolveWith(k, c), f.promise() } }), n.support = function() {var b, c, d, f, g, h, i, j, k, l, m, o = e.createElement("div"); if (o.setAttribute("className", "t"), o.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>", c = o.getElementsByTagName("*"), d = o.getElementsByTagName("a")[0], d.style.cssText = "top:1px;float:left;opacity:.5", !c || !c.length || !d) return {}; f = e.createElement("select"), g = f.appendChild(e.createElement("option")), h = o.getElementsByTagName("input")[0], b = {leadingWhitespace: 3 === o.firstChild.nodeType, tbody: !o.getElementsByTagName("tbody").length, htmlSerialize: !!o.getElementsByTagName("link").length, style: /top/.test(d.getAttribute("style")), hrefNormalized: "/a" === d.getAttribute("href"), opacity: /^0.5/.test(d.style.opacity), cssFloat: !!d.style.cssFloat, checkOn: "on" === h.value, optSelected: g.selected, getSetAttribute: "t" !== o.className, enctype: !!e.createElement("form").enctype, html5Clone: "<:nav></:nav>" !== e.createElement("nav").cloneNode(!0).outerHTML, boxModel: "CSS1Compat" === e.compatMode, submitBubbles: !0, changeBubbles: !0, focusinBubbles: !1, deleteExpando: !0, noCloneEvent: !0, inlineBlockNeedsLayout: !1, shrinkWrapBlocks: !1, reliableMarginRight: !0, boxSizingReliable: !0, pixelPosition: !1 }, h.checked = !0, b.noCloneChecked = h.cloneNode(!0).checked, f.disabled = !0, b.optDisabled = !g.disabled; try {delete o.test } catch (p) {b.deleteExpando = !1 } if (!o.addEventListener && o.attachEvent && o.fireEvent && (o.attachEvent("onclick", m = function() {b.noCloneEvent = !1 }), o.cloneNode(!0).fireEvent("onclick"), o.detachEvent("onclick", m)), h = e.createElement("input"), h.value = "t", h.setAttribute("type", "radio"), b.radioValue = "t" === h.value, h.setAttribute("checked", "checked"), h.setAttribute("name", "t"), o.appendChild(h), i = e.createDocumentFragment(), i.appendChild(o.lastChild), b.checkClone = i.cloneNode(!0).cloneNode(!0).lastChild.checked, b.appendChecked = h.checked, i.removeChild(h), i.appendChild(o), o.attachEvent) for (k in {submit: !0, change: !0, focusin: !0 }) j = "on" + k, l = j in o, l || (o.setAttribute(j, "return;"), l = "function" == typeof o[j]), b[k + "Bubbles"] = l; return n(function() {var c, d, f, g, h = "padding:0;margin:0;border:0;display:block;overflow:hidden;", i = e.getElementsByTagName("body")[0]; i && (c = e.createElement("div"), c.style.cssText = "visibility:hidden;border:0;width:0;height:0;position:static;top:0;margin-top:1px", i.insertBefore(c, i.firstChild), d = e.createElement("div"), c.appendChild(d), d.innerHTML = "<table><tr><td></td><td>t</td></tr></table>", f = d.getElementsByTagName("td"), f[0].style.cssText = "padding:0;margin:0;border:0;display:none", l = 0 === f[0].offsetHeight, f[0].style.display = "", f[1].style.display = "none", b.reliableHiddenOffsets = l && 0 === f[0].offsetHeight, d.innerHTML = "", d.style.cssText = "box-sizing:border-box;-moz-box-sizing:border-box;-webkit-box-sizing:border-box;padding:1px;border:1px;display:block;width:4px;margin-top:1%;position:absolute;top:1%;", b.boxSizing = 4 === d.offsetWidth, b.doesNotIncludeMarginInBodyOffset = 1 !== i.offsetTop, a.getComputedStyle && (b.pixelPosition = "1%" !== (a.getComputedStyle(d, null) || {}).top, b.boxSizingReliable = "4px" === (a.getComputedStyle(d, null) || {width: "4px"}).width, g = e.createElement("div"), g.style.cssText = d.style.cssText = h, g.style.marginRight = g.style.width = "0", d.style.width = "1px", d.appendChild(g), b.reliableMarginRight = !parseFloat((a.getComputedStyle(g, null) || {}).marginRight)), "undefined" != typeof d.style.zoom && (d.innerHTML = "", d.style.cssText = h + "width:1px;padding:1px;display:inline;zoom:1", b.inlineBlockNeedsLayout = 3 === d.offsetWidth, d.style.display = "block", d.style.overflow = "visible", d.innerHTML = "<div></div>", d.firstChild.style.width = "5px", b.shrinkWrapBlocks = 3 !== d.offsetWidth, c.style.zoom = 1), i.removeChild(c), c = d = f = g = null) }), i.removeChild(o), c = d = f = g = h = i = o = null, b }(); var F = /^(?:\{.*\}|\[.*\])$/, G = /([A-Z])/g; n.extend({cache: {}, deletedIds: [], uuid: 0, expando: "jQuery" + (n.fn.jquery + Math.random()).replace(/\D/g, ""), noData: {embed: !0, object: "clsid:D27CDB6E-AE6D-11cf-96B8-444553540000", applet: !0 }, hasData: function(a) {return a = a.nodeType ? n.cache[a[n.expando]] : a[n.expando], !!a && !I(a) }, data: function(a, c, d, e) {if (n.acceptData(a)) {var f, g, h = n.expando, i = "string" == typeof c, j = a.nodeType, k = j ? n.cache : a, l = j ? a[h] : a[h] && h; if (l && k[l] && (e || k[l].data) || !i || d !== b) return l || (j ? a[h] = l = n.deletedIds.pop() || ++n.uuid : l = h), k[l] || (k[l] = {}, j || (k[l].toJSON = n.noop)), ("object" == typeof c || "function" == typeof c) && (e ? k[l] = n.extend(k[l], c) : k[l].data = n.extend(k[l].data, c)), f = k[l], e || (f.data || (f.data = {}), f = f.data), d !== b && (f[n.camelCase(c)] = d), i ? (g = f[c], null == g && (g = f[n.camelCase(c)])) : g = f, g } }, removeData: function(a, b, c) {if (n.acceptData(a)) {var d, e, f, g = a.nodeType, h = g ? n.cache : a, i = g ? a[n.expando] : n.expando; if (h[i]) {if (b && (d = c ? h[i] : h[i].data)) {n.isArray(b) || (b in d ? b = [b] : (b = n.camelCase(b), b = b in d ? [b] : b.split(" "))); for (e = 0, f = b.length; f > e; e++) delete d[b[e]]; if (!(c ? I : n.isEmptyObject)(d)) return }(c || (delete h[i].data, I(h[i]))) && (g ? n.cleanData([a], !0) : n.support.deleteExpando || h != h.window ? delete h[i] : h[i] = null) } } }, _data: function(a, b, c) {return n.data(a, b, c, !0) }, acceptData: function(a) {var b = a.nodeName && n.noData[a.nodeName.toLowerCase()]; return !b || b !== !0 && a.getAttribute("classid") === b } }), n.fn.extend({data: function(a, c) {var d, e, f, g, h, i = this[0], j = 0, k = null; if (a === b) {if (this.length && (k = n.data(i), 1 === i.nodeType && !n._data(i, "parsedAttrs"))) {for (f = i.attributes, h = f.length; h > j; j++) g = f[j].name, 0 === g.indexOf("data-") && (g = n.camelCase(g.substring(5)), H(i, g, k[g])); n._data(i, "parsedAttrs", !0) } return k } return "object" == typeof a ? this.each(function() {n.data(this, a) }) : (d = a.split(".", 2), d[1] = d[1] ? "." + d[1] : "", e = d[1] + "!", n.access(this, function(c) {return c === b ? (k = this.triggerHandler("getData" + e, [d[0]]), k === b && i && (k = n.data(i, a), k = H(i, a, k)), k === b && d[1] ? this.data(d[0]) : k) : (d[1] = c, this.each(function() {var b = n(this); b.triggerHandler("setData" + e, d), n.data(this, a, c), b.triggerHandler("changeData" + e, d) }), void 0) }, null, c, arguments.length > 1, null, !1)) }, removeData: function(a) {return this.each(function() {n.removeData(this, a) }) } }), n.extend({queue: function(a, b, c) {var d; return a ? (b = (b || "fx") + "queue", d = n._data(a, b), c && (!d || n.isArray(c) ? d = n._data(a, b, n.makeArray(c)) : d.push(c)), d || []) : void 0 }, dequeue: function(a, b) {b = b || "fx"; var c = n.queue(a, b), d = c.shift(), e = n._queueHooks(a, b), f = function() {n.dequeue(a, b) }; "inprogress" === d && (d = c.shift()), d && ("fx" === b && c.unshift("inprogress"), delete e.stop, d.call(a, f, e)), !c.length && e && e.empty.fire() }, _queueHooks: function(a, b) {var c = b + "queueHooks"; return n._data(a, c) || n._data(a, c, {empty: n.Callbacks("once memory").add(function() {n.removeData(a, b + "queue", !0), n.removeData(a, c, !0) }) }) } }), n.fn.extend({queue: function(a, c) {var d = 2; return "string" != typeof a && (c = a, a = "fx", d--), arguments.length < d ? n.queue(this[0], a) : c === b ? this : this.each(function() {var b = n.queue(this, a, c); n._queueHooks(this, a), "fx" === a && "inprogress" !== b[0] && n.dequeue(this, a) }) }, dequeue: function(a) {return this.each(function() {n.dequeue(this, a) }) }, delay: function(a, b) {return a = n.fx ? n.fx.speeds[a] || a : a, b = b || "fx", this.queue(b, function(b, c) {var d = setTimeout(b, a); c.stop = function() {clearTimeout(d) } }) }, clearQueue: function(a) {return this.queue(a || "fx", []) }, promise: function(a, c) {var d, e = 1, f = n.Deferred(), g = this, h = this.length, i = function() {--e || f.resolveWith(g, [g]) }; for ("string" != typeof a && (c = a, a = b), a = a || "fx"; h--;)(d = n._data(g[h], a + "queueHooks")) && d.empty && (e++, d.empty.add(i)); return i(), f.promise(c) } }); var J, K, L, M = /[\t\r\n]/g, N = /\r/g, O = /^(?:button|input)$/i, P = /^(?:button|input|object|select|textarea)$/i, Q = /^a(?:rea|)$/i, R = /^(?:autofocus|autoplay|async|checked|controls|defer|disabled|hidden|loop|multiple|open|readonly|required|scoped|selected)$/i, S = n.support.getSetAttribute; n.fn.extend({attr: function(a, b) {return n.access(this, n.attr, a, b, arguments.length > 1) }, removeAttr: function(a) {return this.each(function() {n.removeAttr(this, a) }) }, prop: function(a, b) {return n.access(this, n.prop, a, b, arguments.length > 1) }, removeProp: function(a) {return a = n.propFix[a] || a, this.each(function() {try {this[a] = b, delete this[a] } catch (c) {} }) }, addClass: function(a) {var b, c, d, e, f, g, h; if (n.isFunction(a)) return this.each(function(b) {n(this).addClass(a.call(this, b, this.className)) }); if (a && "string" == typeof a) for (b = a.split(q), c = 0, d = this.length; d > c; c++) if (e = this[c], 1 === e.nodeType) if (e.className || 1 !== b.length) {for (f = " " + e.className + " ", g = 0, h = b.length; h > g; g++) ~f.indexOf(" " + b[g] + " ") || (f += b[g] + " "); e.className = n.trim(f) } else e.className = a; return this }, removeClass: function(a) {var c, d, e, f, g, h, i; if (n.isFunction(a)) return this.each(function(b) {n(this).removeClass(a.call(this, b, this.className)) }); if (a && "string" == typeof a || a === b) for (c = (a || "").split(q), h = 0, i = this.length; i > h; h++) if (e = this[h], 1 === e.nodeType && e.className) {for (d = (" " + e.className + " ").replace(M, " "), f = 0, g = c.length; g > f; f++) for (; d.indexOf(" " + c[f] + " ") > -1;) d = d.replace(" " + c[f] + " ", " "); e.className = a ? n.trim(d) : ""} return this }, toggleClass: function(a, b) {var c = typeof a, d = "boolean" == typeof b; return n.isFunction(a) ? this.each(function(c) {n(this).toggleClass(a.call(this, c, this.className, b), b) }) : this.each(function() {if ("string" === c) for (var e, f = 0, g = n(this), h = b, i = a.split(q); e = i[f++];) h = d ? h : !g.hasClass(e), g[h ? "addClass" : "removeClass"](e); else("undefined" === c || "boolean" === c) && (this.className && n._data(this, "__className__", this.className), this.className = this.className || a === !1 ? "" : n._data(this, "__className__") || "") }) }, hasClass: function(a) {for (var b = " " + a + " ", c = 0, d = this.length; d > c; c++) if (1 === this[c].nodeType && (" " + this[c].className + " ").replace(M, " ").indexOf(b) > -1) return !0; return !1 }, val: function(a) {var c, d, e, f = this[0]; {if (arguments.length) return e = n.isFunction(a), this.each(function(d) {var f, g = n(this); 1 === this.nodeType && (f = e ? a.call(this, d, g.val()) : a, null == f ? f = "" : "number" == typeof f ? f += "" : n.isArray(f) && (f = n.map(f, function(a) {return null == a ? "" : a + ""})), c = n.valHooks[this.type] || n.valHooks[this.nodeName.toLowerCase()], c && "set" in c && c.set(this, f, "value") !== b || (this.value = f)) }); if (f) return c = n.valHooks[f.type] || n.valHooks[f.nodeName.toLowerCase()], c && "get" in c && (d = c.get(f, "value")) !== b ? d : (d = f.value, "string" == typeof d ? d.replace(N, "") : null == d ? "" : d) } } }), n.extend({valHooks: {option: {get: function(a) {var b = a.attributes.value; return !b || b.specified ? a.value : a.text } }, select: {get: function(a) {var b, c, d, e, f = a.selectedIndex, g = [], h = a.options, i = "select-one" === a.type; if (0 > f) return null; for (c = i ? f : 0, d = i ? f + 1 : h.length; d > c; c++) if (e = h[c], !(!e.selected || (n.support.optDisabled ? e.disabled : null !== e.getAttribute("disabled")) || e.parentNode.disabled && n.nodeName(e.parentNode, "optgroup"))) {if (b = n(e).val(), i) return b; g.push(b) } return i && !g.length && h.length ? n(h[f]).val() : g }, set: function(a, b) {var c = n.makeArray(b); return n(a).find("option").each(function() {this.selected = n.inArray(n(this).val(), c) >= 0 }), c.length || (a.selectedIndex = -1), c } } }, attrFn: {}, attr: function(a, c, d, e) {var f, g, h, i = a.nodeType; if (a && 3 !== i && 8 !== i && 2 !== i) return e && n.isFunction(n.fn[c]) ? n(a)[c](d) : "undefined" == typeof a.getAttribute ? n.prop(a, c, d) : (h = 1 !== i || !n.isXMLDoc(a), h && (c = c.toLowerCase(), g = n.attrHooks[c] || (R.test(c) ? K : J)), d !== b ? null === d ? (n.removeAttr(a, c), void 0) : g && "set" in g && h && (f = g.set(a, d, c)) !== b ? f : (a.setAttribute(c, "" + d), d) : g && "get" in g && h && null !== (f = g.get(a, c)) ? f : (f = a.getAttribute(c), null === f ? b : f)) }, removeAttr: function(a, b) {var c, d, e, f, g = 0; if (b && 1 === a.nodeType) for (d = b.split(q); g < d.length; g++) e = d[g], e && (c = n.propFix[e] || e, f = R.test(e), f || n.attr(a, e, ""), a.removeAttribute(S ? e : c), f && c in a && (a[c] = !1)) }, attrHooks: {type: {set: function(a, b) {if (O.test(a.nodeName) && a.parentNode) n.error("type property can't be changed"); else if (!n.support.radioValue && "radio" === b && n.nodeName(a, "input")) {var c = a.value; return a.setAttribute("type", b), c && (a.value = c), b } } }, value: {get: function(a, b) {return J && n.nodeName(a, "button") ? J.get(a, b) : b in a ? a.value : null }, set: function(a, b, c) {return J && n.nodeName(a, "button") ? J.set(a, b, c) : (a.value = b, void 0) } } }, propFix: {tabindex: "tabIndex", readonly: "readOnly", "for": "htmlFor", "class": "className", maxlength: "maxLength", cellspacing: "cellSpacing", cellpadding: "cellPadding", rowspan: "rowSpan", colspan: "colSpan", usemap: "useMap", frameborder: "frameBorder", contenteditable: "contentEditable"}, prop: function(a, c, d) {var e, f, g, h = a.nodeType; if (a && 3 !== h && 8 !== h && 2 !== h) return g = 1 !== h || !n.isXMLDoc(a), g && (c = n.propFix[c] || c, f = n.propHooks[c]), d !== b ? f && "set" in f && (e = f.set(a, d, c)) !== b ? e : a[c] = d : f && "get" in f && null !== (e = f.get(a, c)) ? e : a[c] }, propHooks: {tabIndex: {get: function(a) {var c = a.getAttributeNode("tabindex"); return c && c.specified ? parseInt(c.value, 10) : P.test(a.nodeName) || Q.test(a.nodeName) && a.href ? 0 : b } } } }), K = {get: function(a, c) {var d, e = n.prop(a, c); return e === !0 || "boolean" != typeof e && (d = a.getAttributeNode(c)) && d.nodeValue !== !1 ? c.toLowerCase() : b }, set: function(a, b, c) {var d; return b === !1 ? n.removeAttr(a, c) : (d = n.propFix[c] || c, d in a && (a[d] = !0), a.setAttribute(c, c.toLowerCase())), c } }, S || (L = {name: !0, id: !0, coords: !0 }, J = n.valHooks.button = {get: function(a, c) {var d; return d = a.getAttributeNode(c), d && (L[c] ? "" !== d.value : d.specified) ? d.value : b }, set: function(a, b, c) {var d = a.getAttributeNode(c); return d || (d = e.createAttribute(c), a.setAttributeNode(d)), d.value = b + ""} }, n.each(["width", "height"], function(a, b) {n.attrHooks[b] = n.extend(n.attrHooks[b], {set: function(a, c) {return "" === c ? (a.setAttribute(b, "auto"), c) : void 0 } }) }), n.attrHooks.contenteditable = {get: J.get, set: function(a, b, c) {"" === b && (b = "false"), J.set(a, b, c) } }), n.support.hrefNormalized || n.each(["href", "src", "width", "height"], function(a, c) {n.attrHooks[c] = n.extend(n.attrHooks[c], {get: function(a) {var d = a.getAttribute(c, 2); return null === d ? b : d } }) }), n.support.style || (n.attrHooks.style = {get: function(a) {return a.style.cssText.toLowerCase() || b }, set: function(a, b) {return a.style.cssText = "" + b } }), n.support.optSelected || (n.propHooks.selected = n.extend(n.propHooks.selected, {get: function(a) {var b = a.parentNode; return b && (b.selectedIndex, b.parentNode && b.parentNode.selectedIndex), null } })), n.support.enctype || (n.propFix.enctype = "encoding"), n.support.checkOn || n.each(["radio", "checkbox"], function() {n.valHooks[this] = {get: function(a) {return null === a.getAttribute("value") ? "on" : a.value } } }), n.each(["radio", "checkbox"], function() {n.valHooks[this] = n.extend(n.valHooks[this], {set: function(a, b) {return n.isArray(b) ? a.checked = n.inArray(n(a).val(), b) >= 0 : void 0 } }) }); var T = /^(?:textarea|input|select)$/i, U = /^([^\.]*|)(?:\.(.+)|)$/, V = /(?:^|\s)hover(\.\S+|)\b/, W = /^key/, X = /^(?:mouse|contextmenu)|click/, Y = /^(?:focusinfocus|focusoutblur)$/, Z = function(a) {return n.event.special.hover ? a : a.replace(V, "mouseenter$1 mouseleave$1") }; n.event = {add: function(a, c, d, e, f) {var g, h, i, j, k, l, m, o, p, q, r; if (3 !== a.nodeType && 8 !== a.nodeType && c && d && (g = n._data(a))) {for (d.handler && (p = d, d = p.handler, f = p.selector), d.guid || (d.guid = n.guid++), i = g.events, i || (g.events = i = {}), h = g.handle, h || (g.handle = h = function(a) {return "undefined" == typeof n || a && n.event.triggered === a.type ? b : n.event.dispatch.apply(h.elem, arguments) }, h.elem = a), c = n.trim(Z(c)).split(" "), j = 0; j < c.length; j++) k = U.exec(c[j]) || [], l = k[1], m = (k[2] || "").split(".").sort(), r = n.event.special[l] || {}, l = (f ? r.delegateType : r.bindType) || l, r = n.event.special[l] || {}, o = n.extend({type: l, origType: k[1], data: e, handler: d, guid: d.guid, selector: f, namespace: m.join(".") }, p), q = i[l], q || (q = i[l] = [], q.delegateCount = 0, r.setup && r.setup.call(a, e, m, h) !== !1 || (a.addEventListener ? a.addEventListener(l, h, !1) : a.attachEvent && a.attachEvent("on" + l, h))), r.add && (r.add.call(a, o), o.handler.guid || (o.handler.guid = d.guid)), f ? q.splice(q.delegateCount++, 0, o) : q.push(o), n.event.global[l] = !0; a = null } }, global: {}, remove: function(a, b, c, d, e) {var f, g, h, i, j, k, l, m, o, p, q, r = n.hasData(a) && n._data(a); if (r && (m = r.events)) {for (b = n.trim(Z(b || "")).split(" "), f = 0; f < b.length; f++) if (g = U.exec(b[f]) || [], h = i = g[1], j = g[2], h) {for (o = n.event.special[h] || {}, h = (d ? o.delegateType : o.bindType) || h, p = m[h] || [], k = p.length, j = j ? new RegExp("(^|\\.)" + j.split(".").sort().join("\\.(?:.*\\.|)") + "(\\.|$)") : null, l = 0; l < p.length; l++) q = p[l], !e && i !== q.origType || c && c.guid !== q.guid || j && !j.test(q.namespace) || d && d !== q.selector && ("**" !== d || !q.selector) || (p.splice(l--, 1), q.selector && p.delegateCount--, o.remove && o.remove.call(a, q)); 0 === p.length && k !== p.length && (o.teardown && o.teardown.call(a, j, r.handle) !== !1 || n.removeEvent(a, h, r.handle), delete m[h]) } else for (h in m) n.event.remove(a, h + b[f], c, d, !0); n.isEmptyObject(m) && (delete r.handle, n.removeData(a, "events", !0)) } }, customEvent: {getData: !0, setData: !0, changeData: !0 }, trigger: function(c, d, f, g) {if (!f || 3 !== f.nodeType && 8 !== f.nodeType) {var h, i, j, k, l, m, o, p, q, r, s = c.type || c, t = []; if (!Y.test(s + n.event.triggered) && (s.indexOf("!") >= 0 && (s = s.slice(0, -1), i = !0), s.indexOf(".") >= 0 && (t = s.split("."), s = t.shift(), t.sort()), f && !n.event.customEvent[s] || n.event.global[s])) if (c = "object" == typeof c ? c[n.expando] ? c : new n.Event(s, c) : new n.Event(s), c.type = s, c.isTrigger = !0, c.exclusive = i, c.namespace = t.join("."), c.namespace_re = c.namespace ? new RegExp("(^|\\.)" + t.join("\\.(?:.*\\.|)") + "(\\.|$)") : null, m = s.indexOf(":") < 0 ? "on" + s : "", f) {if (c.result = b, c.target || (c.target = f), d = null != d ? n.makeArray(d) : [], d.unshift(c), o = n.event.special[s] || {}, !o.trigger || o.trigger.apply(f, d) !== !1) {if (q = [[f, o.bindType || s] ], !g && !o.noBubble && !n.isWindow(f)) {for (r = o.delegateType || s, k = Y.test(r + s) ? f : f.parentNode, l = f; k; k = k.parentNode) q.push([k, r]), l = k; l === (f.ownerDocument || e) && q.push([l.defaultView || l.parentWindow || a, r]) } for (j = 0; j < q.length && !c.isPropagationStopped(); j++) k = q[j][0], c.type = q[j][1], p = (n._data(k, "events") || {})[c.type] && n._data(k, "handle"), p && p.apply(k, d), p = m && k[m], p && n.acceptData(k) && p.apply(k, d) === !1 && c.preventDefault(); return c.type = s, g || c.isDefaultPrevented() || o._default && o._default.apply(f.ownerDocument, d) !== !1 || "click" === s && n.nodeName(f, "a") || !n.acceptData(f) || m && f[s] && ("focus" !== s && "blur" !== s || 0 !== c.target.offsetWidth) && !n.isWindow(f) && (l = f[m], l && (f[m] = null), n.event.triggered = s, f[s](), n.event.triggered = b, l && (f[m] = l)), c.result } } else {h = n.cache; for (j in h) h[j].events && h[j].events[s] && n.event.trigger(c, d, h[j].handle.elem, !0) } } }, dispatch: function(c) {c = n.event.fix(c || a.event); var d, e, f, g, h, i, j, k, l, m, p = (n._data(this, "events") || {})[c.type] || [], q = p.delegateCount, r = [].slice.call(arguments), s = !c.exclusive && !c.namespace, t = n.event.special[c.type] || {}, u = []; if (r[0] = c, c.delegateTarget = this, !t.preDispatch || t.preDispatch.call(this, c) !== !1) {if (q && (!c.button || "click" !== c.type)) for (g = n(this), g.context = this, f = c.target; f != this; f = f.parentNode || this) if (f.disabled !== !0 || "click" !== c.type) {for (i = {}, k = [], g[0] = f, d = 0; q > d; d++) l = p[d], m = l.selector, i[m] === b && (i[m] = g.is(m)), i[m] && k.push(l); k.length && u.push({elem: f, matches: k }) } for (p.length > q && u.push({elem: this, matches: p.slice(q) }), d = 0; d < u.length && !c.isPropagationStopped(); d++) for (j = u[d], c.currentTarget = j.elem, e = 0; e < j.matches.length && !c.isImmediatePropagationStopped(); e++) l = j.matches[e], (s || !c.namespace && !l.namespace || c.namespace_re && c.namespace_re.test(l.namespace)) && (c.data = l.data, c.handleObj = l, h = ((n.event.special[l.origType] || {}).handle || l.handler).apply(j.elem, r), h !== b && (c.result = h, h === !1 && (c.preventDefault(), c.stopPropagation()))); return t.postDispatch && t.postDispatch.call(this, c), c.result } }, props: "attrChange attrName relatedNode srcElement altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "), fixHooks: {}, keyHooks: {props: "char charCode key keyCode".split(" "), filter: function(a, b) {return null == a.which && (a.which = null != b.charCode ? b.charCode : b.keyCode), a } }, mouseHooks: {props: "button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "), filter: function(a, c) {var d, f, g, h = c.button, i = c.fromElement; return null == a.pageX && null != c.clientX && (d = a.target.ownerDocument || e, f = d.documentElement, g = d.body, a.pageX = c.clientX + (f && f.scrollLeft || g && g.scrollLeft || 0) - (f && f.clientLeft || g && g.clientLeft || 0), a.pageY = c.clientY + (f && f.scrollTop || g && g.scrollTop || 0) - (f && f.clientTop || g && g.clientTop || 0)), !a.relatedTarget && i && (a.relatedTarget = i === a.target ? c.toElement : i), a.which || h === b || (a.which = 1 & h ? 1 : 2 & h ? 3 : 4 & h ? 2 : 0), a } }, fix: function(a) {if (a[n.expando]) return a; var b, c, d = a, f = n.event.fixHooks[a.type] || {}, g = f.props ? this.props.concat(f.props) : this.props; for (a = n.Event(d), b = g.length; b;) c = g[--b], a[c] = d[c]; return a.target || (a.target = d.srcElement || e), 3 === a.target.nodeType && (a.target = a.target.parentNode), a.metaKey = !!a.metaKey, f.filter ? f.filter(a, d) : a }, special: {ready: {setup: n.bindReady }, load: {noBubble: !0 }, focus: {delegateType: "focusin"}, blur: {delegateType: "focusout"}, beforeunload: {setup: function(a, b, c) {n.isWindow(this) && (this.onbeforeunload = c) }, teardown: function(a, b) {this.onbeforeunload === b && (this.onbeforeunload = null) } } }, simulate: function(a, b, c, d) {var e = n.extend(new n.Event, c, {type: a, isSimulated: !0, originalEvent: {} }); d ? n.event.trigger(e, null, b) : n.event.dispatch.call(b, e), e.isDefaultPrevented() && c.preventDefault() } }, n.event.handle = n.event.dispatch, n.removeEvent = e.removeEventListener ? function(a, b, c) {a.removeEventListener && a.removeEventListener(b, c, !1) } : function(a, b, c) {var d = "on" + b; a.detachEvent && ("undefined" == typeof a[d] && (a[d] = null), a.detachEvent(d, c)) }, n.Event = function(a, b) {return this instanceof n.Event ? (a && a.type ? (this.originalEvent = a, this.type = a.type, this.isDefaultPrevented = a.defaultPrevented || a.returnValue === !1 || a.getPreventDefault && a.getPreventDefault() ? _ : $) : this.type = a, b && n.extend(this, b), this.timeStamp = a && a.timeStamp || n.now(), this[n.expando] = !0, void 0) : new n.Event(a, b) }, n.Event.prototype = {preventDefault: function() {this.isDefaultPrevented = _; var a = this.originalEvent; a && (a.preventDefault ? a.preventDefault() : a.returnValue = !1) }, stopPropagation: function() {this.isPropagationStopped = _; var a = this.originalEvent; a && (a.stopPropagation && a.stopPropagation(), a.cancelBubble = !0) }, stopImmediatePropagation: function() {this.isImmediatePropagationStopped = _, this.stopPropagation() }, isDefaultPrevented: $, isPropagationStopped: $, isImmediatePropagationStopped: $ }, n.each({mouseenter: "mouseover", mouseleave: "mouseout"}, function(a, b) {n.event.special[a] = {delegateType: b, bindType: b, handle: function(a) {var c, d = this, e = a.relatedTarget, f = a.handleObj; return f.selector, (!e || e !== d && !n.contains(d, e)) && (a.type = f.origType, c = f.handler.apply(this, arguments), a.type = b), c } } }), n.support.submitBubbles || (n.event.special.submit = {setup: function() {return n.nodeName(this, "form") ? !1 : (n.event.add(this, "click._submit keypress._submit", function(a) {var c = a.target, d = n.nodeName(c, "input") || n.nodeName(c, "button") ? c.form : b; d && !n._data(d, "_submit_attached") && (n.event.add(d, "submit._submit", function(a) {a._submit_bubble = !0 }), n._data(d, "_submit_attached", !0)) }), void 0) }, postDispatch: function(a) {a._submit_bubble && (delete a._submit_bubble, this.parentNode && !a.isTrigger && n.event.simulate("submit", this.parentNode, a, !0)) }, teardown: function() {return n.nodeName(this, "form") ? !1 : (n.event.remove(this, "._submit"), void 0) } }), n.support.changeBubbles || (n.event.special.change = {setup: function() {return T.test(this.nodeName) ? (("checkbox" === this.type || "radio" === this.type) && (n.event.add(this, "propertychange._change", function(a) {"checked" === a.originalEvent.propertyName && (this._just_changed = !0) }), n.event.add(this, "click._change", function(a) {this._just_changed && !a.isTrigger && (this._just_changed = !1), n.event.simulate("change", this, a, !0) })), !1) : (n.event.add(this, "beforeactivate._change", function(a) {var b = a.target; T.test(b.nodeName) && !n._data(b, "_change_attached") && (n.event.add(b, "change._change", function(a) {!this.parentNode || a.isSimulated || a.isTrigger || n.event.simulate("change", this.parentNode, a, !0) }), n._data(b, "_change_attached", !0)) }), void 0) }, handle: function(a) {var b = a.target; return this !== b || a.isSimulated || a.isTrigger || "radio" !== b.type && "checkbox" !== b.type ? a.handleObj.handler.apply(this, arguments) : void 0 }, teardown: function() {return n.event.remove(this, "._change"), T.test(this.nodeName) } }), n.support.focusinBubbles || n.each({focus: "focusin", blur: "focusout"}, function(a, b) {var c = 0, d = function(a) {n.event.simulate(b, a.target, n.event.fix(a), !0) }; n.event.special[b] = {setup: function() {0 === c++ && e.addEventListener(a, d, !0) }, teardown: function() {0 === --c && e.removeEventListener(a, d, !0) } } }), n.fn.extend({on: function(a, c, d, e, f) {var g, h; if ("object" == typeof a) {"string" != typeof c && (d = d || c, c = b); for (h in a) this.on(h, c, d, a[h], f); return this } if (null == d && null == e ? (e = c, d = c = b) : null == e && ("string" == typeof c ? (e = d, d = b) : (e = d, d = c, c = b)), e === !1) e = $; else if (!e) return this; return 1 === f && (g = e, e = function(a) {return n().off(a), g.apply(this, arguments) }, e.guid = g.guid || (g.guid = n.guid++)), this.each(function() {n.event.add(this, a, e, d, c) }) }, one: function(a, b, c, d) {return this.on(a, b, c, d, 1) }, off: function(a, c, d) {var e, f; if (a && a.preventDefault && a.handleObj) return e = a.handleObj, n(a.delegateTarget).off(e.namespace ? e.origType + "." + e.namespace : e.origType, e.selector, e.handler), this; if ("object" == typeof a) {for (f in a) this.off(f, c, a[f]); return this } return (c === !1 || "function" == typeof c) && (d = c, c = b), d === !1 && (d = $), this.each(function() {n.event.remove(this, a, d, c) }) }, bind: function(a, b, c) {return this.on(a, null, b, c) }, unbind: function(a, b) {return this.off(a, null, b) }, live: function(a, b, c) {return n(this.context).on(a, this.selector, b, c), this }, die: function(a, b) {return n(this.context).off(a, this.selector || "**", b), this }, delegate: function(a, b, c, d) {return this.on(b, a, c, d) }, undelegate: function(a, b, c) {return 1 == arguments.length ? this.off(a, "**") : this.off(b, a || "**", c) }, trigger: function(a, b) {return this.each(function() {n.event.trigger(a, b, this) }) }, triggerHandler: function(a, b) {return this[0] ? n.event.trigger(a, b, this[0], !0) : void 0 }, toggle: function(a) {var b = arguments, c = a.guid || n.guid++, d = 0, e = function(c) {var e = (n._data(this, "lastToggle" + a.guid) || 0) % d; return n._data(this, "lastToggle" + a.guid, e + 1), c.preventDefault(), b[e].apply(this, arguments) || !1 }; for (e.guid = c; d < b.length;) b[d++].guid = c; return this.click(e) }, hover: function(a, b) {return this.mouseenter(a).mouseleave(b || a) } }), n.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "), function(a, b) {n.fn[b] = function(a, c) {return null == c && (c = a, a = null), arguments.length > 0 ? this.on(b, null, a, c) : this.trigger(b) }, W.test(b) && (n.event.fixHooks[b] = n.event.keyHooks), X.test(b) && (n.event.fixHooks[b] = n.event.mouseHooks) }), function(a, b) {function db(a, b, c, d) {for (var e = 0, f = b.length; f > e; e++) Z(a, b[e], c, d) } function eb(a, b, c, d, e, f) {var g, h = $.setFilters[b.toLowerCase()]; return h || Z.error(b), (a || !(g = e)) && db(a || "*", d, g = [], e), g.length > 0 ? h(g, c, f) : [] } function fb(a, c, d, e, f) {for (var g, h, i, j, k, l, m, n, o = 0, q = f.length, s = L.POS, t = new RegExp("^" + s.source + "(?!" + r + ")", "i"), u = function() {for (var a = 1, c = arguments.length - 2; c > a; a++) arguments[a] === b && (g[a] = b) }; q > o; o++) {for (s.exec(""), a = f[o], j = [], i = 0, k = e; g = s.exec(a);) n = s.lastIndex = g.index + g[0].length, n > i && (m = a.slice(i, g.index), i = n, l = [c], B.test(m) && (k && (l = k), k = e), (h = H.test(m)) && (m = m.slice(0, -5).replace(B, "$&*")), g.length > 1 && g[0].replace(t, u), k = eb(m, g[1], g[2], l, k, h)); k ? (j = j.concat(k), (m = a.slice(i)) && ")" !== m ? B.test(m) ? db(m, j, d, e) : Z(m, c, d, e ? e.concat(k) : k) : p.apply(d, j)) : Z(a, c, d, e) } return 1 === q ? d : Z.uniqueSort(d) } function gb(a, b, c) {for (var d, e, f, g = [], i = 0, j = D.exec(a), k = !j.pop() && !j.pop(), l = k && a.match(C) || [""], m = $.preFilter, n = $.filter, o = !c && b !== h; null != (e = l[i]) && k; i++) for (g.push(d = []), o && (e = " " + e); e;) {k = !1, (j = B.exec(e)) && (e = e.slice(j[0].length), k = d.push({part: j.pop().replace(A, " "), captures: j })); for (f in n) !(j = L[f].exec(e)) || m[f] && !(j = m[f](j, b, c)) || (e = e.slice(j.shift().length), k = d.push({part: f, captures: j })); if (!k) break } return k || Z.error(a), g } function hb(a, b, e) {var f = b.dir, g = m++; return a || (a = function(a) {return a === e }), b.first ? function(b, c) {for (; b = b[f];) if (1 === b.nodeType) return a(b, c) && b } : function(b, e) {for (var h, i = g + "." + d, j = i + "." + c; b = b[f];) if (1 === b.nodeType) {if ((h = b[q]) === j) return b.sizset; if ("string" == typeof h && 0 === h.indexOf(i)) {if (b.sizset) return b } else {if (b[q] = j, a(b, e)) return b.sizset = !0, b; b.sizset = !1 } } } } function ib(a, b) {return a ? function(c, d) {var e = b(c, d); return e && a(e === !0 ? c : e, d) } : b } function jb(a, b, c) {for (var d, e, f = 0; d = a[f]; f++) $.relative[d.part] ? e = hb(e, $.relative[d.part], b) : (d.captures.push(b, c), e = ib(e, $.filter[d.part].apply(null, d.captures))); return e } function kb(a) {return function(b, c) {for (var d, e = 0; d = a[e]; e++) if (d(b, c)) return !0; return !1 } } var c, d, e, f, g, h = a.document, i = h.documentElement, j = "undefined", k = !1, l = !0, m = 0, o = [].slice, p = [].push, q = ("sizcache" + Math.random()).replace(".", ""), r = "[\\x20\\t\\r\\n\\f]", s = "(?:\\\\.|[-\\w]|[^\\x00-\\xa0])+", t = s.replace("w", "w#"), u = "([*^$|!~]?=)", v = "\\[" + r + "*(" + s + ")" + r + "*(?:" + u + r + "*(?:(['\"])((?:\\\\.|[^\\\\])*?)\\3|(" + t + ")|)|)" + r + "*\\]", w = ":(" + s + ")(?:\\((?:(['\"])((?:\\\\.|[^\\\\])*?)\\2|((?:[^,]|\\\\,|(?:,(?=[^\\[]*\\]))|(?:,(?=[^\\(]*\\))))*))\\)|)", x = ":(nth|eq|gt|lt|first|last|even|odd)(?:\\((\\d*)\\)|)(?=[^-]|$)", y = r + "*([\\x20\\t\\r\\n\\f>+~])" + r + "*", z = "(?=[^\\x20\\t\\r\\n\\f])(?:\\\\.|" + v + "|" + w.replace(2, 7) + "|[^\\\\(),])+", A = new RegExp("^" + r + "+|((?:^|[^\\\\])(?:\\\\.)*)" + r + "+$", "g"), B = new RegExp("^" + y), C = new RegExp(z + "?(?=" + r + "*,|$)", "g"), D = new RegExp("^(?:(?!,)(?:(?:^|,)" + r + "*" + z + ")*?|" + r + "*(.*?))(\\)|$)"), E = new RegExp(z.slice(19, -6) + "\\x20\\t\\r\\n\\f>+~])+|" + y, "g"), F = /^(?:#([\w\-]+)|(\w+)|\.([\w\-]+))$/, G = /[\x20\t\r\n\f]*[+~]/, H = /:not\($/, I = /h\d/i, J = /input|select|textarea|button/i, K = /\\(?!\\)/g, L = {ID: new RegExp("^#(" + s + ")"), CLASS: new RegExp("^\\.(" + s + ")"), NAME: new RegExp("^\\[name=['\"]?(" + s + ")['\"]?\\]"), TAG: new RegExp("^(" + s.replace("[-", "[-\\*") + ")"), ATTR: new RegExp("^" + v), PSEUDO: new RegExp("^" + w), CHILD: new RegExp("^:(only|nth|last|first)-child(?:\\(" + r + "*(even|odd|(([+-]|)(\\d*)n|)" + r + "*(?:([+-]|)" + r + "*(\\d+)|))" + r + "*\\)|)", "i"), POS: new RegExp(x, "ig"), needsContext: new RegExp("^" + r + "*[>+~]|" + x, "i") }, M = {}, N = [], O = {}, P = [], Q = function(a) {return a.sizzleFilter = !0, a }, R = function(a) {return function(b) {return "input" === b.nodeName.toLowerCase() && b.type === a } }, S = function(a) {return function(b) {var c = b.nodeName.toLowerCase(); return ("input" === c || "button" === c) && b.type === a } }, T = function(a) {var b = !1, c = h.createElement("div"); try {b = a(c) } catch (d) {} return c = null, b }, U = T(function(a) {a.innerHTML = "<select></select>"; var b = typeof a.lastChild.getAttribute("multiple"); return "boolean" !== b && "string" !== b }), V = T(function(a) {a.id = q + 0, a.innerHTML = "<a name='" + q + "'></a><div name='" + q + "'></div>", i.insertBefore(a, i.firstChild); var b = h.getElementsByName && h.getElementsByName(q).length === 2 + h.getElementsByName(q + 0).length; return g = !h.getElementById(q), i.removeChild(a), b }), W = T(function(a) {return a.appendChild(h.createComment("")), 0 === a.getElementsByTagName("*").length }), X = T(function(a) {return a.innerHTML = "<a href='#'></a>", a.firstChild && typeof a.firstChild.getAttribute !== j && "#" === a.firstChild.getAttribute("href") }), Y = T(function(a) {return a.innerHTML = "<div class='hidden e'></div><div class='hidden'></div>", a.getElementsByClassName && 0 !== a.getElementsByClassName("e").length ? (a.lastChild.className = "e", 1 !== a.getElementsByClassName("e").length) : !1 }), Z = function(a, b, c, d) {c = c || [], b = b || h; var e, f, g, i, j = b.nodeType; if (1 !== j && 9 !== j) return []; if (!a || "string" != typeof a) return c; if (g = ab(b), !g && !d && (e = F.exec(a))) if (i = e[1]) {if (9 === j) {if (f = b.getElementById(i), !f || !f.parentNode) return c; if (f.id === i) return c.push(f), c } else if (b.ownerDocument && (f = b.ownerDocument.getElementById(i)) && bb(b, f) && f.id === i) return c.push(f), c } else {if (e[2]) return p.apply(c, o.call(b.getElementsByTagName(a), 0)), c; if ((i = e[3]) && Y && b.getElementsByClassName) return p.apply(c, o.call(b.getElementsByClassName(i), 0)), c } return mb(a, b, c, d, g) }, $ = Z.selectors = {cacheLength: 50, match: L, order: ["ID", "TAG"], attrHandle: {}, createPseudo: Q, find: {ID: g ? function(a, b, c) {if (typeof b.getElementById !== j && !c) {var d = b.getElementById(a); return d && d.parentNode ? [d] : [] } } : function(a, c, d) {if (typeof c.getElementById !== j && !d) {var e = c.getElementById(a); return e ? e.id === a || typeof e.getAttributeNode !== j && e.getAttributeNode("id").value === a ? [e] : b : [] } }, TAG: W ? function(a, b) {return typeof b.getElementsByTagName !== j ? b.getElementsByTagName(a) : void 0 } : function(a, b) {var c = b.getElementsByTagName(a); if ("*" === a) {for (var d, e = [], f = 0; d = c[f]; f++) 1 === d.nodeType && e.push(d); return e } return c } }, relative: {">": {dir: "parentNode", first: !0 }, " ": {dir: "parentNode"}, "+": {dir: "previousSibling", first: !0 }, "~": {dir: "previousSibling"} }, preFilter: {ATTR: function(a) {return a[1] = a[1].replace(K, ""), a[3] = (a[4] || a[5] || "").replace(K, ""), "~=" === a[2] && (a[3] = " " + a[3] + " "), a.slice(0, 4) }, CHILD: function(a) {return a[1] = a[1].toLowerCase(), "nth" === a[1] ? (a[2] || Z.error(a[0]), a[3] = +(a[3] ? a[4] + (a[5] || 1) : 2 * ("even" === a[2] || "odd" === a[2])), a[4] = +(a[6] + a[7] || "odd" === a[2])) : a[2] && Z.error(a[0]), a }, PSEUDO: function(a) {var b, c = a[4]; return L.CHILD.test(a[0]) ? null : (c && (b = D.exec(c)) && b.pop() && (a[0] = a[0].slice(0, b[0].length - c.length - 1), c = b[0].slice(0, -1)), a.splice(2, 3, c || a[3]), a) } }, filter: {ID: g ? function(a) {return a = a.replace(K, ""), function(b) {return b.getAttribute("id") === a } } : function(a) {return a = a.replace(K, ""), function(b) {var c = typeof b.getAttributeNode !== j && b.getAttributeNode("id"); return c && c.value === a } }, TAG: function(a) {return "*" === a ? function() {return !0 } : (a = a.replace(K, "").toLowerCase(), function(b) {return b.nodeName && b.nodeName.toLowerCase() === a }) }, CLASS: function(a) {var b = M[a]; return b || (b = M[a] = new RegExp("(^|" + r + ")" + a + "(" + r + "|$)"), N.push(a), N.length > $.cacheLength && delete M[N.shift()]), function(a) {return b.test(a.className || typeof a.getAttribute !== j && a.getAttribute("class") || "") } }, ATTR: function(a, b, c) {return b ? function(d) {var e = Z.attr(d, a), f = e + ""; if (null == e) return "!=" === b; switch (b) {case "=": return f === c; case "!=": return f !== c; case "^=": return c && 0 === f.indexOf(c); case "*=": return c && f.indexOf(c) > -1; case "$=": return c && f.substr(f.length - c.length) === c; case "~=": return (" " + f + " ").indexOf(c) > -1; case "|=": return f === c || f.substr(0, c.length + 1) === c + "-"} } : function(b) {return null != Z.attr(b, a) } }, CHILD: function(a, b, c, d) {if ("nth" === a) {var e = m++; return function(a) {var b, f, g = 0, h = a; if (1 === c && 0 === d) return !0; if (b = a.parentNode, b && (b[q] !== e || !a.sizset)) {for (h = b.firstChild; h && (1 !== h.nodeType || (h.sizset = ++g, h !== a)); h = h.nextSibling); b[q] = e } return f = a.sizset - d, 0 === c ? 0 === f : 0 === f % c && f / c >= 0 } } return function(b) {var c = b; switch (a) {case "only": case "first": for (; c = c.previousSibling;) if (1 === c.nodeType) return !1; if ("first" === a) return !0; c = b; case "last": for (; c = c.nextSibling;) if (1 === c.nodeType) return !1; return !0 } } }, PSEUDO: function(a, b, c, d) {var e = $.pseudos[a] || $.pseudos[a.toLowerCase()]; return e || Z.error("unsupported pseudo: " + a), e.sizzleFilter ? e(b, c, d) : e } }, pseudos: {not: Q(function(a, b, c) {var d = lb(a.replace(A, "$1"), b, c); return function(a) {return !d(a) } }), enabled: function(a) {return a.disabled === !1 }, disabled: function(a) {return a.disabled === !0 }, checked: function(a) {var b = a.nodeName.toLowerCase(); return "input" === b && !!a.checked || "option" === b && !!a.selected }, selected: function(a) {return a.parentNode && a.parentNode.selectedIndex, a.selected === !0 }, parent: function(a) {return !$.pseudos.empty(a) }, empty: function(a) {var b; for (a = a.firstChild; a;) {if (a.nodeName > "@" || 3 === (b = a.nodeType) || 4 === b) return !1; a = a.nextSibling } return !0 }, contains: Q(function(a) {return function(b) {return (b.textContent || b.innerText || cb(b)).indexOf(a) > -1 } }), has: Q(function(a) {return function(b) {return Z(a, b).length > 0 } }), header: function(a) {return I.test(a.nodeName) }, text: function(a) {var b, c; return "input" === a.nodeName.toLowerCase() && "text" === (b = a.type) && (null == (c = a.getAttribute("type")) || c.toLowerCase() === b) }, radio: R("radio"), checkbox: R("checkbox"), file: R("file"), password: R("password"), image: R("image"), submit: S("submit"), reset: S("reset"), button: function(a) {var b = a.nodeName.toLowerCase(); return "input" === b && "button" === a.type || "button" === b }, input: function(a) {return J.test(a.nodeName) }, focus: function(a) {var b = a.ownerDocument; return !(a !== b.activeElement || b.hasFocus && !b.hasFocus() || !a.type && !a.href) }, active: function(a) {return a === a.ownerDocument.activeElement } }, setFilters: {first: function(a, b, c) {return c ? a.slice(1) : [a[0]] }, last: function(a, b, c) {var d = a.pop(); return c ? a : [d] }, even: function(a, b, c) {for (var d = [], e = c ? 1 : 0, f = a.length; f > e; e += 2) d.push(a[e]); return d }, odd: function(a, b, c) {for (var d = [], e = c ? 0 : 1, f = a.length; f > e; e += 2) d.push(a[e]); return d }, lt: function(a, b, c) {return c ? a.slice(+b) : a.slice(0, +b) }, gt: function(a, b, c) {return c ? a.slice(0, +b + 1) : a.slice(+b + 1) }, eq: function(a, b, c) {var d = a.splice(+b, 1); return c ? a : d } } }; $.setFilters.nth = $.setFilters.eq, $.filters = $.pseudos, X || ($.attrHandle = {href: function(a) {return a.getAttribute("href", 2) }, type: function(a) {return a.getAttribute("type") } }), V && ($.order.push("NAME"), $.find.NAME = function(a, b) {return typeof b.getElementsByName !== j ? b.getElementsByName(a) : void 0 }), Y && ($.order.splice(1, 0, "CLASS"), $.find.CLASS = function(a, b, c) {return typeof b.getElementsByClassName === j || c ? void 0 : b.getElementsByClassName(a) }); try {o.call(i.childNodes, 0)[0].nodeType } catch (_) {o = function(a) {for (var b, c = []; b = this[a]; a++) c.push(b); return c } } var ab = Z.isXML = function(a) {var b = a && (a.ownerDocument || a).documentElement; return b ? "HTML" !== b.nodeName : !1 }, bb = Z.contains = i.compareDocumentPosition ? function(a, b) {return !!(16 & a.compareDocumentPosition(b)) } : i.contains ? function(a, b) {var c = 9 === a.nodeType ? a.documentElement : a, d = b.parentNode; return a === d || !!(d && 1 === d.nodeType && c.contains && c.contains(d)) } : function(a, b) {for (; b = b.parentNode;) if (b === a) return !0; return !1 }, cb = Z.getText = function(a) {var b, c = "", d = 0, e = a.nodeType; if (e) {if (1 === e || 9 === e || 11 === e) {if ("string" == typeof a.textContent) return a.textContent; for (a = a.firstChild; a; a = a.nextSibling) c += cb(a) } else if (3 === e || 4 === e) return a.nodeValue } else for (; b = a[d]; d++) c += cb(b); return c }; Z.attr = function(a, b) {var c, d = ab(a); return d || (b = b.toLowerCase()), $.attrHandle[b] ? $.attrHandle[b](a) : U || d ? a.getAttribute(b) : (c = a.getAttributeNode(b), c ? "boolean" == typeof a[b] ? a[b] ? b : null : c.specified ? c.value : null : null) }, Z.error = function(a) {throw new Error("Syntax error, unrecognized expression: " + a) }, [0, 0].sort(function() {return l = 0 }), i.compareDocumentPosition ? e = function(a, b) {return a === b ? (k = !0, 0) : (a.compareDocumentPosition && b.compareDocumentPosition ? 4 & a.compareDocumentPosition(b) : a.compareDocumentPosition) ? -1 : 1 } : (e = function(a, b) {if (a === b) return k = !0, 0; if (a.sourceIndex && b.sourceIndex) return a.sourceIndex - b.sourceIndex; var c, d, e = [], g = [], h = a.parentNode, i = b.parentNode, j = h; if (h === i) return f(a, b); if (!h) return -1; if (!i) return 1; for (; j;) e.unshift(j), j = j.parentNode; for (j = i; j;) g.unshift(j), j = j.parentNode; c = e.length, d = g.length; for (var l = 0; c > l && d > l; l++) if (e[l] !== g[l]) return f(e[l], g[l]); return l === c ? f(a, g[l], -1) : f(e[l], b, 1) }, f = function(a, b, c) {if (a === b) return c; for (var d = a.nextSibling; d;) {if (d === b) return -1; d = d.nextSibling } return 1 }), Z.uniqueSort = function(a) {var b, c = 1; if (e && (k = l, a.sort(e), k)) for (; b = a[c]; c++) b === a[c - 1] && a.splice(c--, 1); return a }; var lb = Z.compile = function(a, b, c) {var d, e, f, g = O[a]; if (g && g.context === b) return g; for (e = gb(a, b, c), f = 0; d = e[f]; f++) e[f] = jb(d, b, c); return g = O[a] = kb(e), g.context = b, g.runs = g.dirruns = 0, P.push(a), P.length > $.cacheLength && delete O[P.shift()], g }; Z.matches = function(a, b) {return Z(a, null, null, b) }, Z.matchesSelector = function(a, b) {return Z(b, null, null, [a]).length > 0 }; var mb = function(a, b, e, f, g) {a = a.replace(A, "$1"); var h, i, j, k, l, m, n, q, r, s = a.match(C), t = a.match(E), u = b.nodeType; if (L.POS.test(a)) return fb(a, b, e, f, s); if (f) h = o.call(f, 0); else if (s && 1 === s.length) {if (t.length > 1 && 9 === u && !g && (s = L.ID.exec(t[0]))) {if (b = $.find.ID(s[1], b, g)[0], !b) return e; a = a.slice(t.shift().length) } for (q = (s = G.exec(t[0])) && !s.index && b.parentNode || b, r = t.pop(), m = r.split(":not")[0], j = 0, k = $.order.length; k > j; j++) if (n = $.order[j], s = L[n].exec(m)) {if (h = $.find[n]((s[1] || "").replace(K, ""), q, g), null == h) continue; m === r && (a = a.slice(0, a.length - r.length) + m.replace(L[n], ""), a || p.apply(e, o.call(h, 0))); break } } if (a) for (i = lb(a, b, g), d = i.dirruns++, null == h && (h = $.find.TAG("*", G.test(a) && b.parentNode || b)), j = 0; l = h[j]; j++) c = i.runs++, i(l, b) && e.push(l); return e }; h.querySelectorAll && function() {var a, b = mb, c = /'|\\/g, d = /\=[\x20\t\r\n\f]*([^'"\]]*)[\x20\t\r\n\f]*\]/g, e = [], f = [":active"], g = i.matchesSelector || i.mozMatchesSelector || i.webkitMatchesSelector || i.oMatchesSelector || i.msMatchesSelector; T(function(a) {a.innerHTML = "<select><option selected></option></select>", a.querySelectorAll("[selected]").length || e.push("\\[" + r + "*(?:checked|disabled|ismap|multiple|readonly|selected|value)"), a.querySelectorAll(":checked").length || e.push(":checked") }), T(function(a) {a.innerHTML = "<p test=''></p>", a.querySelectorAll("[test^='']").length && e.push("[*^$]=" + r + "*(?:\"\"|'')"), a.innerHTML = "<input type='hidden'>", a.querySelectorAll(":enabled").length || e.push(":enabled", ":disabled") }), e = e.length && new RegExp(e.join("|")), mb = function(a, d, f, g, h) {if (!(g || h || e && e.test(a))) if (9 === d.nodeType) try {return p.apply(f, o.call(d.querySelectorAll(a), 0)), f } catch (i) {} else if (1 === d.nodeType && "object" !== d.nodeName.toLowerCase()) {var j = d.getAttribute("id"), k = j || q, l = G.test(a) && d.parentNode || d; j ? k = k.replace(c, "\\$&") : d.setAttribute("id", k); try {return p.apply(f, o.call(l.querySelectorAll(a.replace(C, "[id='" + k + "'] $&")), 0)), f } catch (i) {} finally {j || d.removeAttribute("id") } } return b(a, d, f, g, h) }, g && (T(function(b) {a = g.call(b, "div"); try {g.call(b, "[test!='']:sizzle"), f.push($.match.PSEUDO) } catch (c) {} }), f = new RegExp(f.join("|")), Z.matchesSelector = function(b, c) {if (c = c.replace(d, "='$1']"), !(ab(b) || f.test(c) || e && e.test(c))) try {var h = g.call(b, c); if (h || a || b.document && 11 !== b.document.nodeType) return h } catch (i) {} return Z(c, null, null, [b]).length > 0 }) }(), Z.attr = n.attr, n.find = Z, n.expr = Z.selectors, n.expr[":"] = n.expr.pseudos, n.unique = Z.uniqueSort, n.text = Z.getText, n.isXMLDoc = Z.isXML, n.contains = Z.contains }(a); var ab = /Until$/, bb = /^(?:parents|prev(?:Until|All))/, cb = /^.[^:#\[\.,]*$/, db = n.expr.match.needsContext, eb = {children: !0, contents: !0, next: !0, prev: !0 }; n.fn.extend({find: function(a) {var b, c, d, e, f, g, h = this; if ("string" != typeof a) return n(a).filter(function() {for (b = 0, c = h.length; c > b; b++) if (n.contains(h[b], this)) return !0 }); for (g = this.pushStack("", "find", a), b = 0, c = this.length; c > b; b++) if (d = g.length, n.find(a, this[b], g), b > 0) for (e = d; e < g.length; e++) for (f = 0; d > f; f++) if (g[f] === g[e]) {g.splice(e--, 1); break } return g }, has: function(a) {var b, c = n(a, this), d = c.length; return this.filter(function() {for (b = 0; d > b; b++) if (n.contains(this, c[b])) return !0 }) }, not: function(a) {return this.pushStack(hb(this, a, !1), "not", a) }, filter: function(a) {return this.pushStack(hb(this, a, !0), "filter", a) }, is: function(a) {return !!a && ("string" == typeof a ? db.test(a) ? n(a, this.context).index(this[0]) >= 0 : n.filter(a, this).length > 0 : this.filter(a).length > 0) }, closest: function(a, b) {for (var c, d = 0, e = this.length, f = [], g = db.test(a) || "string" != typeof a ? n(a, b || this.context) : 0; e > d; d++) for (c = this[d]; c && c.ownerDocument && c !== b && 11 !== c.nodeType;) {if (g ? g.index(c) > -1 : n.find.matchesSelector(c, a)) {f.push(c); break } c = c.parentNode } return f = f.length > 1 ? n.unique(f) : f, this.pushStack(f, "closest", a) }, index: function(a) {return a ? "string" == typeof a ? n.inArray(this[0], n(a)) : n.inArray(a.jquery ? a[0] : a, this) : this[0] && this[0].parentNode ? this.prevAll().length : -1 }, add: function(a, b) {var c = "string" == typeof a ? n(a, b) : n.makeArray(a && a.nodeType ? [a] : a), d = n.merge(this.get(), c); return this.pushStack(fb(c[0]) || fb(d[0]) ? d : n.unique(d)) }, addBack: function(a) {return this.add(null == a ? this.prevObject : this.prevObject.filter(a)) } }), n.fn.andSelf = n.fn.addBack, n.each({parent: function(a) {var b = a.parentNode; return b && 11 !== b.nodeType ? b : null }, parents: function(a) {return n.dir(a, "parentNode") }, parentsUntil: function(a, b, c) {return n.dir(a, "parentNode", c) }, next: function(a) {return gb(a, "nextSibling") }, prev: function(a) {return gb(a, "previousSibling") }, nextAll: function(a) {return n.dir(a, "nextSibling") }, prevAll: function(a) {return n.dir(a, "previousSibling") }, nextUntil: function(a, b, c) {return n.dir(a, "nextSibling", c) }, prevUntil: function(a, b, c) {return n.dir(a, "previousSibling", c) }, siblings: function(a) {return n.sibling((a.parentNode || {}).firstChild, a) }, children: function(a) {return n.sibling(a.firstChild) }, contents: function(a) {return n.nodeName(a, "iframe") ? a.contentDocument || a.contentWindow.document : n.merge([], a.childNodes) } }, function(a, b) {n.fn[a] = function(c, d) {var e = n.map(this, b, c); return ab.test(a) || (d = c), d && "string" == typeof d && (e = n.filter(d, e)), e = this.length > 1 && !eb[a] ? n.unique(e) : e, this.length > 1 && bb.test(a) && (e = e.reverse()), this.pushStack(e, a, i.call(arguments).join(",")) } }), n.extend({filter: function(a, b, c) {return c && (a = ":not(" + a + ")"), 1 === b.length ? n.find.matchesSelector(b[0], a) ? [b[0]] : [] : n.find.matches(a, b) }, dir: function(a, c, d) {for (var e = [], f = a[c]; f && 9 !== f.nodeType && (d === b || 1 !== f.nodeType || !n(f).is(d));) 1 === f.nodeType && e.push(f), f = f[c]; return e }, sibling: function(a, b) {for (var c = []; a; a = a.nextSibling) 1 === a.nodeType && a !== b && c.push(a); return c } }); var jb = "abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|header|hgroup|mark|meter|nav|output|progress|section|summary|time|video", kb = / jQuery\d+="(?:null|\d+)"/g, lb = /^\s+/, mb = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi, nb = /<([\w:]+)/, ob = /<tbody/i, pb = /<|&#?\w+;/, qb = /<(?:script|style|link)/i, rb = /<(?:script|object|embed|option|style)/i, sb = new RegExp("<(?:" + jb + ")[\\s/>]", "i"), tb = /^(?:checkbox|radio)$/, ub = /checked\s*(?:[^=]|=\s*.checked.)/i, vb = /\/(java|ecma)script/i, wb = /^\s*<!(?:\[CDATA\[|\-\-)|[\]\-]{2}>\s*$/g, xb = {option: [1, "<select multiple='multiple'>", "</select>"], legend: [1, "<fieldset>", "</fieldset>"], thead: [1, "<table>", "</table>"], tr: [2, "<table><tbody>", "</tbody></table>"], td: [3, "<table><tbody><tr>", "</tr></tbody></table>"], col: [2, "<table><tbody></tbody><colgroup>", "</colgroup></table>"], area: [1, "<map>", "</map>"], _default: [0, "", ""] }, yb = ib(e), zb = yb.appendChild(e.createElement("div")); xb.optgroup = xb.option, xb.tbody = xb.tfoot = xb.colgroup = xb.caption = xb.thead, xb.th = xb.td, n.support.htmlSerialize || (xb._default = [1, "X<div>", "</div>"]), n.fn.extend({text: function(a) {return n.access(this, function(a) {return a === b ? n.text(this) : this.empty().append((this[0] && this[0].ownerDocument || e).createTextNode(a)) }, null, a, arguments.length) }, wrapAll: function(a) {if (n.isFunction(a)) return this.each(function(b) {n(this).wrapAll(a.call(this, b)) }); if (this[0]) {var b = n(a, this[0].ownerDocument).eq(0).clone(!0); this[0].parentNode && b.insertBefore(this[0]), b.map(function() {for (var a = this; a.firstChild && 1 === a.firstChild.nodeType;) a = a.firstChild; return a }).append(this) } return this }, wrapInner: function(a) {return n.isFunction(a) ? this.each(function(b) {n(this).wrapInner(a.call(this, b)) }) : this.each(function() {var b = n(this), c = b.contents(); c.length ? c.wrapAll(a) : b.append(a) }) }, wrap: function(a) {var b = n.isFunction(a); return this.each(function(c) {n(this).wrapAll(b ? a.call(this, c) : a) }) }, unwrap: function() {return this.parent().each(function() {n.nodeName(this, "body") || n(this).replaceWith(this.childNodes) }).end() }, append: function() {return this.domManip(arguments, !0, function(a) {(1 === this.nodeType || 11 === this.nodeType) && this.appendChild(a) }) }, prepend: function() {return this.domManip(arguments, !0, function(a) {(1 === this.nodeType || 11 === this.nodeType) && this.insertBefore(a, this.firstChild) }) }, before: function() {if (!fb(this[0])) return this.domManip(arguments, !1, function(a) {this.parentNode.insertBefore(a, this) }); if (arguments.length) {var a = n.clean(arguments); return this.pushStack(n.merge(a, this), "before", this.selector) } }, after: function() {if (!fb(this[0])) return this.domManip(arguments, !1, function(a) {this.parentNode.insertBefore(a, this.nextSibling) }); if (arguments.length) {var a = n.clean(arguments); return this.pushStack(n.merge(this, a), "after", this.selector) } }, remove: function(a, b) {for (var c, d = 0; null != (c = this[d]); d++)(!a || n.filter(a, [c]).length) && (b || 1 !== c.nodeType || (n.cleanData(c.getElementsByTagName("*")), n.cleanData([c])), c.parentNode && c.parentNode.removeChild(c)); return this }, empty: function() {for (var a, b = 0; null != (a = this[b]); b++) for (1 === a.nodeType && n.cleanData(a.getElementsByTagName("*")); a.firstChild;) a.removeChild(a.firstChild); return this }, clone: function(a, b) {return a = null == a ? !1 : a, b = null == b ? a : b, this.map(function() {return n.clone(this, a, b) }) }, html: function(a) {return n.access(this, function(a) {var c = this[0] || {}, d = 0, e = this.length; if (a === b) return 1 === c.nodeType ? c.innerHTML.replace(kb, "") : b; if (!("string" != typeof a || qb.test(a) || !n.support.htmlSerialize && sb.test(a) || !n.support.leadingWhitespace && lb.test(a) || xb[(nb.exec(a) || ["", ""])[1].toLowerCase()])) {a = a.replace(mb, "<$1></$2>"); try {for (; e > d; d++) c = this[d] || {}, 1 === c.nodeType && (n.cleanData(c.getElementsByTagName("*")), c.innerHTML = a); c = 0 } catch (f) {} } c && this.empty().append(a) }, null, a, arguments.length) }, replaceWith: function(a) {return fb(this[0]) ? this.length ? this.pushStack(n(n.isFunction(a) ? a() : a), "replaceWith", a) : this : n.isFunction(a) ? this.each(function(b) {var c = n(this), d = c.html(); c.replaceWith(a.call(this, b, d)) }) : ("string" != typeof a && (a = n(a).detach()), this.each(function() {var b = this.nextSibling, c = this.parentNode; n(this).remove(), b ? n(b).before(a) : n(c).append(a) })) }, detach: function(a) {return this.remove(a, !0) }, domManip: function(a, c, d) {a = [].concat.apply([], a); var e, f, g, h, i = 0, j = a[0], k = [], l = this.length; if (!n.support.checkClone && l > 1 && "string" == typeof j && ub.test(j)) return this.each(function() {n(this).domManip(a, c, d) }); if (n.isFunction(j)) return this.each(function(e) {var f = n(this); a[0] = j.call(this, e, c ? f.html() : b), f.domManip(a, c, d) }); if (this[0]) {if (e = n.buildFragment(a, this, k), g = e.fragment, f = g.firstChild, 1 === g.childNodes.length && (g = f), f) for (c = c && n.nodeName(f, "tr"), h = e.cacheable || l - 1; l > i; i++) d.call(c && n.nodeName(this[i], "table") ? Ab(this[i], "tbody") : this[i], i === h ? g : n.clone(g, !0, !0)); g = f = null, k.length && n.each(k, function(a, b) {b.src ? n.ajax ? n.ajax({url: b.src, type: "GET", dataType: "script", async: !1, global: !1, "throws": !0 }) : n.error("no ajax") : n.globalEval((b.text || b.textContent || b.innerHTML || "").replace(wb, "")), b.parentNode && b.parentNode.removeChild(b) }) } return this } }), n.buildFragment = function(a, c, d) {var f, g, h, i = a[0]; return c = c || e, c = (c[0] || c).ownerDocument || c[0] || c, "undefined" == typeof c.createDocumentFragment && (c = e), !(1 === a.length && "string" == typeof i && i.length < 512 && c === e && "<" === i.charAt(0)) || rb.test(i) || !n.support.checkClone && ub.test(i) || !n.support.html5Clone && sb.test(i) || (g = !0, f = n.fragments[i], h = f !== b), f || (f = c.createDocumentFragment(), n.clean(a, c, f, d), g && (n.fragments[i] = h && f)), {fragment: f, cacheable: g } }, n.fragments = {}, n.each({appendTo: "append", prependTo: "prepend", insertBefore: "before", insertAfter: "after", replaceAll: "replaceWith"}, function(a, b) {n.fn[a] = function(c) {var d, e = 0, f = [], g = n(c), h = g.length, i = 1 === this.length && this[0].parentNode; if ((null == i || i && 11 === i.nodeType && 1 === i.childNodes.length) && 1 === h) return g[b](this[0]), this; for (; h > e; e++) d = (e > 0 ? this.clone(!0) : this).get(), n(g[e])[b](d), f = f.concat(d); return this.pushStack(f, a, g.selector) } }), n.extend({clone: function(a, b, c) {var d, e, f, g; if (n.support.html5Clone || n.isXMLDoc(a) || !sb.test("<" + a.nodeName + ">") ? g = a.cloneNode(!0) : (zb.innerHTML = a.outerHTML, zb.removeChild(g = zb.firstChild)), !(n.support.noCloneEvent && n.support.noCloneChecked || 1 !== a.nodeType && 11 !== a.nodeType || n.isXMLDoc(a))) for (Cb(a, g), d = Db(a), e = Db(g), f = 0; d[f]; ++f) e[f] && Cb(d[f], e[f]); if (b && (Bb(a, g), c)) for (d = Db(a), e = Db(g), f = 0; d[f]; ++f) Bb(d[f], e[f]); return d = e = null, g }, clean: function(a, b, c, d) {var f, g, h, i, j, k, l, m, o, q, r, s = 0, t = []; for (b && "undefined" != typeof b.createDocumentFragment || (b = e), g = b === e && yb; null != (h = a[s]); s++) if ("number" == typeof h && (h += ""), h) {if ("string" == typeof h) if (pb.test(h)) {for (g = g || ib(b), l = l || g.appendChild(b.createElement("div")), h = h.replace(mb, "<$1></$2>"), i = (nb.exec(h) || ["", ""])[1].toLowerCase(), j = xb[i] || xb._default, k = j[0], l.innerHTML = j[1] + h + j[2]; k--;) l = l.lastChild; if (!n.support.tbody) for (m = ob.test(h), o = "table" !== i || m ? "<table>" !== j[1] || m ? [] : l.childNodes : l.firstChild && l.firstChild.childNodes, f = o.length - 1; f >= 0; --f) n.nodeName(o[f], "tbody") && !o[f].childNodes.length && o[f].parentNode.removeChild(o[f]); !n.support.leadingWhitespace && lb.test(h) && l.insertBefore(b.createTextNode(lb.exec(h)[0]), l.firstChild), h = l.childNodes, l = g.lastChild } else h = b.createTextNode(h); h.nodeType ? t.push(h) : t = n.merge(t, h) } if (l && (g.removeChild(l), h = l = g = null), !n.support.appendChecked) for (s = 0; null != (h = t[s]); s++) n.nodeName(h, "input") ? Eb(h) : "undefined" != typeof h.getElementsByTagName && n.grep(h.getElementsByTagName("input"), Eb); if (c) for (q = function(a) {return !a.type || vb.test(a.type) ? d ? d.push(a.parentNode ? a.parentNode.removeChild(a) : a) : c.appendChild(a) : void 0 }, s = 0; null != (h = t[s]); s++) n.nodeName(h, "script") && q(h) || (c.appendChild(h), "undefined" != typeof h.getElementsByTagName && (r = n.grep(n.merge([], h.getElementsByTagName("script")), q), t.splice.apply(t, [s + 1, 0].concat(r)), s += r.length)); return t }, cleanData: function(a, b) {for (var c, d, e, f, g = 0, h = n.expando, i = n.cache, j = n.support.deleteExpando, k = n.event.special; null != (e = a[g]); g++) if ((b || n.acceptData(e)) && (d = e[h], c = d && i[d])) {if (c.events) for (f in c.events) k[f] ? n.event.remove(e, f) : n.removeEvent(e, f, c.handle); i[d] && (delete i[d], j ? delete e[h] : e.removeAttribute ? e.removeAttribute(h) : e[h] = null, n.deletedIds.push(d)) } } }), function() {var a, b; n.uaMatch = function(a) {a = a.toLowerCase(); var b = /(chrome)[ \/]([\w.]+)/.exec(a) || /(webkit)[ \/]([\w.]+)/.exec(a) || /(opera)(?:.*version|)[ \/]([\w.]+)/.exec(a) || /(msie) ([\w.]+)/.exec(a) || a.indexOf("compatible") < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec(a) || []; return {browser: b[1] || "", version: b[2] || "0"} }, a = n.uaMatch(g.userAgent), b = {}, a.browser && (b[a.browser] = !0, b.version = a.version), b.webkit && (b.safari = !0), n.browser = b, n.sub = function() {function a(b, c) {return new a.fn.init(b, c) } n.extend(!0, a, this), a.superclass = this, a.fn = a.prototype = this(), a.fn.constructor = a, a.sub = this.sub, a.fn.init = function(c, d) {return d && d instanceof n && !(d instanceof a) && (d = a(d)), n.fn.init.call(this, c, d, b) }, a.fn.init.prototype = a.fn; var b = a(e); return a } }(); var Fb, Gb, Hb, Ib = /alpha\([^)]*\)/i, Jb = /opacity=([^)]*)/, Kb = /^(top|right|bottom|left)$/, Lb = /^margin/, Mb = new RegExp("^(" + o + ")(.*)$", "i"), Nb = new RegExp("^(" + o + ")(?!px)[a-z%]+$", "i"), Ob = new RegExp("^([-+])=(" + o + ")", "i"), Pb = {}, Qb = {position: "absolute", visibility: "hidden", display: "block"}, Rb = {letterSpacing: 0, fontWeight: 400, lineHeight: 1 }, Sb = ["Top", "Right", "Bottom", "Left"], Tb = ["Webkit", "O", "Moz", "ms"], Ub = n.fn.toggle; n.fn.extend({css: function(a, c) {return n.access(this, function(a, c, d) {return d !== b ? n.style(a, c, d) : n.css(a, c) }, a, c, arguments.length > 1) }, show: function() {return Xb(this, !0) }, hide: function() {return Xb(this) }, toggle: function(a, b) {var c = "boolean" == typeof a; return n.isFunction(a) && n.isFunction(b) ? Ub.apply(this, arguments) : this.each(function() {(c ? a : Wb(this)) ? n(this).show(): n(this).hide() }) } }), n.extend({cssHooks: {opacity: {get: function(a, b) {if (b) {var c = Fb(a, "opacity"); return "" === c ? "1" : c } } } }, cssNumber: {fillOpacity: !0, fontWeight: !0, lineHeight: !0, opacity: !0, orphans: !0, widows: !0, zIndex: !0, zoom: !0 }, cssProps: {"float": n.support.cssFloat ? "cssFloat" : "styleFloat"}, style: function(a, c, d, e) {if (a && 3 !== a.nodeType && 8 !== a.nodeType && a.style) {var f, g, h, i = n.camelCase(c), j = a.style; if (c = n.cssProps[i] || (n.cssProps[i] = Vb(j, i)), h = n.cssHooks[c] || n.cssHooks[i], d === b) return h && "get" in h && (f = h.get(a, !1, e)) !== b ? f : j[c]; if (g = typeof d, "string" === g && (f = Ob.exec(d)) && (d = (f[1] + 1) * f[2] + parseFloat(n.css(a, c)), g = "number"), !(null == d || "number" === g && isNaN(d) || ("number" !== g || n.cssNumber[i] || (d += "px"), h && "set" in h && (d = h.set(a, d, e)) === b))) try {j[c] = d } catch (k) {} } }, css: function(a, c, d, e) {var f, g, h, i = n.camelCase(c); return c = n.cssProps[i] || (n.cssProps[i] = Vb(a.style, i)), h = n.cssHooks[c] || n.cssHooks[i], h && "get" in h && (f = h.get(a, !0, e)), f === b && (f = Fb(a, c)), "normal" === f && c in Rb && (f = Rb[c]), d || e !== b ? (g = parseFloat(f), d || n.isNumeric(g) ? g || 0 : f) : f }, swap: function(a, b, c) {var d, e, f = {}; for (e in b) f[e] = a.style[e], a.style[e] = b[e]; d = c.call(a); for (e in b) a.style[e] = f[e]; return d } }), a.getComputedStyle ? Fb = function(a, b) {var c, d, e, f, g = getComputedStyle(a, null), h = a.style; return g && (c = g[b], "" !== c || n.contains(a.ownerDocument.documentElement, a) || (c = n.style(a, b)), Nb.test(c) && Lb.test(b) && (d = h.width, e = h.minWidth, f = h.maxWidth, h.minWidth = h.maxWidth = h.width = c, c = g.width, h.width = d, h.minWidth = e, h.maxWidth = f)), c } : e.documentElement.currentStyle && (Fb = function(a, b) {var c, d, e = a.currentStyle && a.currentStyle[b], f = a.style; return null == e && f && f[b] && (e = f[b]), Nb.test(e) && !Kb.test(b) && (c = f.left, d = a.runtimeStyle && a.runtimeStyle.left, d && (a.runtimeStyle.left = a.currentStyle.left), f.left = "fontSize" === b ? "1em" : e, e = f.pixelLeft + "px", f.left = c, d && (a.runtimeStyle.left = d)), "" === e ? "auto" : e }), n.each(["height", "width"], function(a, b) {n.cssHooks[b] = {get: function(a, c, d) {return c ? 0 !== a.offsetWidth || "none" !== Fb(a, "display") ? $b(a, b, d) : n.swap(a, Qb, function() {return $b(a, b, d) }) : void 0 }, set: function(a, c, d) {return Yb(a, c, d ? Zb(a, b, d, n.support.boxSizing && "border-box" === n.css(a, "boxSizing")) : 0) } } }), n.support.opacity || (n.cssHooks.opacity = {get: function(a, b) {return Jb.test((b && a.currentStyle ? a.currentStyle.filter : a.style.filter) || "") ? .01 * parseFloat(RegExp.$1) + "" : b ? "1" : ""}, set: function(a, b) {var c = a.style, d = a.currentStyle, e = n.isNumeric(b) ? "alpha(opacity=" + 100 * b + ")" : "", f = d && d.filter || c.filter || ""; c.zoom = 1, b >= 1 && "" === n.trim(f.replace(Ib, "")) && c.removeAttribute && (c.removeAttribute("filter"), d && !d.filter) || (c.filter = Ib.test(f) ? f.replace(Ib, e) : f + " " + e) } }), n(function() {n.support.reliableMarginRight || (n.cssHooks.marginRight = {get: function(a, b) {return n.swap(a, {display: "inline-block"}, function() {return b ? Fb(a, "marginRight") : void 0 }) } }), !n.support.pixelPosition && n.fn.position && n.each(["top", "left"], function(a, b) {n.cssHooks[b] = {get: function(a, c) {if (c) {var d = Fb(a, b); return Nb.test(d) ? n(a).position()[b] + "px" : d } } } }) }), n.expr && n.expr.filters && (n.expr.filters.hidden = function(a) {return 0 === a.offsetWidth && 0 === a.offsetHeight || !n.support.reliableHiddenOffsets && "none" === (a.style && a.style.display || Fb(a, "display")) }, n.expr.filters.visible = function(a) {return !n.expr.filters.hidden(a) }), n.each({margin: "", padding: "", border: "Width"}, function(a, b) {n.cssHooks[a + b] = {expand: function(c) {var d, e = "string" == typeof c ? c.split(" ") : [c], f = {}; for (d = 0; 4 > d; d++) f[a + Sb[d] + b] = e[d] || e[d - 2] || e[0]; return f } }, Lb.test(a) || (n.cssHooks[a + b].set = Yb) }); var ac = /%20/g, bc = /\[\]$/, cc = /\r?\n/g, dc = /^(?:color|date|datetime|datetime-local|email|hidden|month|number|password|range|search|tel|text|time|url|week)$/i, ec = /^(?:select|textarea)/i; n.fn.extend({serialize: function() {return n.param(this.serializeArray()) }, serializeArray: function() {return this.map(function() {return this.elements ? n.makeArray(this.elements) : this }).filter(function() {return this.name && !this.disabled && (this.checked || ec.test(this.nodeName) || dc.test(this.type)) }).map(function(a, b) {var c = n(this).val(); return null == c ? null : n.isArray(c) ? n.map(c, function(a) {return {name: b.name, value: a.replace(cc, "\r\n") } }) : {name: b.name, value: c.replace(cc, "\r\n") } }).get() } }), n.param = function(a, c) {var d, e = [], f = function(a, b) {b = n.isFunction(b) ? b() : null == b ? "" : b, e[e.length] = encodeURIComponent(a) + "=" + encodeURIComponent(b) }; if (c === b && (c = n.ajaxSettings && n.ajaxSettings.traditional), n.isArray(a) || a.jquery && !n.isPlainObject(a)) n.each(a, function() {f(this.name, this.value) }); else for (d in a) fc(d, a[d], c, f); return e.join("&").replace(ac, "+") }; var gc, hc, ic = /#.*$/, jc = /^(.*?):[ \t]*([^\r\n]*)\r?$/gm, kc = /^(?:about|app|app\-storage|.+\-extension|file|res|widget):$/, lc = /^(?:GET|HEAD)$/, mc = /^\/\//, nc = /\?/, oc = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, pc = /([?&])_=[^&]*/, qc = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+)|)|)/, rc = n.fn.load, sc = {}, tc = {}, uc = ["*/"] + ["*"]; try {gc = f.href } catch (vc) {gc = e.createElement("a"), gc.href = "", gc = gc.href } hc = qc.exec(gc.toLowerCase()) || [], n.fn.load = function(a, c, d) {if ("string" != typeof a && rc) return rc.apply(this, arguments); if (!this.length) return this; var e, f, g, h = this, i = a.indexOf(" "); return i >= 0 && (e = a.slice(i, a.length), a = a.slice(0, i)), n.isFunction(c) ? (d = c, c = b) : "object" == typeof c && (f = "POST"), n.ajax({url: a, type: f, dataType: "html", data: c, complete: function(a, b) {d && h.each(d, g || [a.responseText, b, a]) } }).done(function(a) {g = arguments, h.html(e ? n("<div>").append(a.replace(oc, "")).find(e) : a) }), this }, n.each("ajaxStart ajaxStop ajaxComplete ajaxError ajaxSuccess ajaxSend".split(" "), function(a, b) {n.fn[b] = function(a) {return this.on(b, a) } }), n.each(["get", "post"], function(a, c) {n[c] = function(a, d, e, f) {return n.isFunction(d) && (f = f || e, e = d, d = b), n.ajax({type: c, url: a, data: d, success: e, dataType: f }) } }), n.extend({getScript: function(a, c) {return n.get(a, b, c, "script") }, getJSON: function(a, b, c) {return n.get(a, b, c, "json") }, ajaxSetup: function(a, b) {return b ? yc(a, n.ajaxSettings) : (b = a, a = n.ajaxSettings), yc(a, b), a }, ajaxSettings: {url: gc, isLocal: kc.test(hc[1]), global: !0, type: "GET", contentType: "application/x-www-form-urlencoded; charset=UTF-8", processData: !0, async: !0, accepts: {xml: "application/xml, text/xml", html: "text/html", text: "text/plain", json: "application/json, text/javascript", "*": uc }, contents: {xml: /xml/, html: /html/, json: /json/ }, responseFields: {xml: "responseXML", text: "responseText"}, converters: {"* text": a.String, "text html": !0, "text json": n.parseJSON, "text xml": n.parseXML }, flatOptions: {context: !0, url: !0 } }, ajaxPrefilter: wc(sc), ajaxTransport: wc(tc), ajax: function(a, c) {function y(a, c, f, i) {var k, q, t, u, w, y = c; 2 !== v && (v = 2, h && clearTimeout(h), g = b, e = i || "", x.readyState = a > 0 ? 4 : 0, f && (u = zc(l, x, f)), a >= 200 && 300 > a || 304 === a ? (l.ifModified && (w = x.getResponseHeader("Last-Modified"), w && (n.lastModified[d] = w), w = x.getResponseHeader("Etag"), w && (n.etag[d] = w)), 304 === a ? (y = "notmodified", k = !0) : (k = Ac(l, u), y = k.state, q = k.data, t = k.error, k = !t)) : (t = y, (!y || a) && (y = "error", 0 > a && (a = 0))), x.status = a, x.statusText = "" + (c || y), k ? p.resolveWith(m, [q, y, x]) : p.rejectWith(m, [x, y, t]), x.statusCode(s), s = b, j && o.trigger("ajax" + (k ? "Success" : "Error"), [x, l, k ? q : t]), r.fireWith(m, [x, y]), j && (o.trigger("ajaxComplete", [x, l]), --n.active || n.event.trigger("ajaxStop"))) } "object" == typeof a && (c = a, a = b), c = c || {}; var d, e, f, g, h, i, j, k, l = n.ajaxSetup({}, c), m = l.context || l, o = m !== l && (m.nodeType || m instanceof n) ? n(m) : n.event, p = n.Deferred(), r = n.Callbacks("once memory"), s = l.statusCode || {}, t = {}, u = {}, v = 0, w = "canceled", x = {readyState: 0, setRequestHeader: function(a, b) {if (!v) {var c = a.toLowerCase(); a = u[c] = u[c] || a, t[a] = b } return this }, getAllResponseHeaders: function() {return 2 === v ? e : null }, getResponseHeader: function(a) {var c; if (2 === v) {if (!f) for (f = {}; c = jc.exec(e);) f[c[1].toLowerCase()] = c[2]; c = f[a.toLowerCase()] } return c === b ? null : c }, overrideMimeType: function(a) {return v || (l.mimeType = a), this }, abort: function(a) {return a = a || w, g && g.abort(a), y(0, a), this } }; if (p.promise(x), x.success = x.done, x.error = x.fail, x.complete = r.add, x.statusCode = function(a) {if (a) {var b; if (2 > v) for (b in a) s[b] = [s[b], a[b]]; else b = a[x.status], x.always(b) } return this }, l.url = ((a || l.url) + "").replace(ic, "").replace(mc, hc[1] + "//"), l.dataTypes = n.trim(l.dataType || "*").toLowerCase().split(q), null == l.crossDomain && (i = qc.exec(l.url.toLowerCase()), l.crossDomain = !(!i || i[1] == hc[1] && i[2] == hc[2] && (i[3] || ("http:" === i[1] ? 80 : 443)) == (hc[3] || ("http:" === hc[1] ? 80 : 443)))), l.data && l.processData && "string" != typeof l.data && (l.data = n.param(l.data, l.traditional)), xc(sc, l, c, x), 2 === v) return x; if (j = l.global, l.type = l.type.toUpperCase(), l.hasContent = !lc.test(l.type), j && 0 === n.active++ && n.event.trigger("ajaxStart"), !l.hasContent && (l.data && (l.url += (nc.test(l.url) ? "&" : "?") + l.data, delete l.data), d = l.url, l.cache === !1)) {var z = n.now(), A = l.url.replace(pc, "$1_=" + z); l.url = A + (A === l.url ? (nc.test(l.url) ? "&" : "?") + "_=" + z : "") }(l.data && l.hasContent && l.contentType !== !1 || c.contentType) && x.setRequestHeader("Content-Type", l.contentType), l.ifModified && (d = d || l.url, n.lastModified[d] && x.setRequestHeader("If-Modified-Since", n.lastModified[d]), n.etag[d] && x.setRequestHeader("If-None-Match", n.etag[d])), x.setRequestHeader("Accept", l.dataTypes[0] && l.accepts[l.dataTypes[0]] ? l.accepts[l.dataTypes[0]] + ("*" !== l.dataTypes[0] ? ", " + uc + "; q=0.01" : "") : l.accepts["*"]); for (k in l.headers) x.setRequestHeader(k, l.headers[k]); if (l.beforeSend && (l.beforeSend.call(m, x, l) === !1 || 2 === v)) return x.abort(); w = "abort"; for (k in {success: 1, error: 1, complete: 1 }) x[k](l[k]); if (g = xc(tc, l, c, x)) {x.readyState = 1, j && o.trigger("ajaxSend", [x, l]), l.async && l.timeout > 0 && (h = setTimeout(function() {x.abort("timeout") }, l.timeout)); try {v = 1, g.send(t, y) } catch (B) {if (!(2 > v)) throw B; y(-1, B) } } else y(-1, "No Transport"); return x }, active: 0, lastModified: {}, etag: {} }); var Bc = [], Cc = /\?/, Dc = /(=)\?(?=&|$)|\?\?/, Ec = n.now(); n.ajaxSetup({jsonp: "callback", jsonpCallback: function() {var a = Bc.pop() || n.expando + "_" + Ec++; return this[a] = !0, a } }), n.ajaxPrefilter("json jsonp", function(c, d, e) {var f, g, h, i = c.data, j = c.url, k = c.jsonp !== !1, l = k && Dc.test(j), m = k && !l && "string" == typeof i && !(c.contentType || "").indexOf("application/x-www-form-urlencoded") && Dc.test(i); return "jsonp" === c.dataTypes[0] || l || m ? (f = c.jsonpCallback = n.isFunction(c.jsonpCallback) ? c.jsonpCallback() : c.jsonpCallback, g = a[f], l ? c.url = j.replace(Dc, "$1" + f) : m ? c.data = i.replace(Dc, "$1" + f) : k && (c.url += (Cc.test(j) ? "&" : "?") + c.jsonp + "=" + f), c.converters["script json"] = function() {return h || n.error(f + " was not called"), h[0] }, c.dataTypes[0] = "json", a[f] = function() {h = arguments }, e.always(function() {a[f] = g, c[f] && (c.jsonpCallback = d.jsonpCallback, Bc.push(f)), h && n.isFunction(g) && g(h[0]), h = g = b }), "script") : void 0 }), n.ajaxSetup({accepts: {script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"}, contents: {script: /javascript|ecmascript/ }, converters: {"text script": function(a) {return n.globalEval(a), a } } }), n.ajaxPrefilter("script", function(a) {a.cache === b && (a.cache = !1), a.crossDomain && (a.type = "GET", a.global = !1) }), n.ajaxTransport("script", function(a) {if (a.crossDomain) {var c, d = e.head || e.getElementsByTagName("head")[0] || e.documentElement; return {send: function(f, g) {c = e.createElement("script"), c.async = "async", a.scriptCharset && (c.charset = a.scriptCharset), c.src = a.url, c.onload = c.onreadystatechange = function(a, e) {(e || !c.readyState || /loaded|complete/.test(c.readyState)) && (c.onload = c.onreadystatechange = null, d && c.parentNode && d.removeChild(c), c = b, e || g(200, "success")) }, d.insertBefore(c, d.firstChild) }, abort: function() {c && c.onload(0, 1) } } } }); var Fc, Gc = a.ActiveXObject ? function() {for (var a in Fc) Fc[a](0, 1) } : !1, Hc = 0; n.ajaxSettings.xhr = a.ActiveXObject ? function() {return !this.isLocal && Ic() || Jc() } : Ic, function(a) {n.extend(n.support, {ajax: !!a, cors: !!a && "withCredentials" in a }) }(n.ajaxSettings.xhr()), n.support.ajax && n.ajaxTransport(function(c) {if (!c.crossDomain || n.support.cors) {var d; return {send: function(e, f) {var g, h, i = c.xhr(); if (c.username ? i.open(c.type, c.url, c.async, c.username, c.password) : i.open(c.type, c.url, c.async), c.xhrFields) for (h in c.xhrFields) i[h] = c.xhrFields[h]; c.mimeType && i.overrideMimeType && i.overrideMimeType(c.mimeType), c.crossDomain || e["X-Requested-With"] || (e["X-Requested-With"] = "XMLHttpRequest"); try {for (h in e) i.setRequestHeader(h, e[h]) } catch (j) {} i.send(c.hasContent && c.data || null), d = function(a, e) {var h, j, k, l, m; try {if (d && (e || 4 === i.readyState)) if (d = b, g && (i.onreadystatechange = n.noop, Gc && delete Fc[g]), e) 4 !== i.readyState && i.abort(); else {h = i.status, k = i.getAllResponseHeaders(), l = {}, m = i.responseXML, m && m.documentElement && (l.xml = m); try {l.text = i.responseText } catch (a) {} try {j = i.statusText } catch (o) {j = ""} h || !c.isLocal || c.crossDomain ? 1223 === h && (h = 204) : h = l.text ? 200 : 404 } } catch (p) {e || f(-1, p) } l && f(h, j, l, k) }, c.async ? 4 === i.readyState ? setTimeout(d, 0) : (g = ++Hc, Gc && (Fc || (Fc = {}, n(a).unload(Gc)), Fc[g] = d), i.onreadystatechange = d) : d() }, abort: function() {d && d(0, 1) } } } }); var Kc, Lc, Mc = /^(?:toggle|show|hide)$/, Nc = new RegExp("^(?:([-+])=|)(" + o + ")([a-z%]*)$", "i"), Oc = /queueHooks$/, Pc = [Vc], Qc = {"*": [function(a, b) {var c, d, e, f = this.createTween(a, b), g = Nc.exec(b), h = f.cur(), i = +h || 0, j = 1; if (g) {if (c = +g[2], d = g[3] || (n.cssNumber[a] ? "" : "px"), "px" !== d && i) {i = n.css(f.elem, a, !0) || c || 1; do e = j = j || ".5", i /= j, n.style(f.elem, a, i + d), j = f.cur() / h; while (1 !== j && j !== e) } f.unit = d, f.start = i, f.end = g[1] ? i + (g[1] + 1) * c : c } return f }] }; n.Animation = n.extend(Tc, {tweener: function(a, b) {n.isFunction(a) ? (b = a, a = ["*"]) : a = a.split(" "); for (var c, d = 0, e = a.length; e > d; d++) c = a[d], Qc[c] = Qc[c] || [], Qc[c].unshift(b) }, prefilter: function(a, b) {b ? Pc.unshift(a) : Pc.push(a) } }), n.Tween = Wc, Wc.prototype = {constructor: Wc, init: function(a, b, c, d, e, f) {this.elem = a, this.prop = c, this.easing = e || "swing", this.options = b, this.start = this.now = this.cur(), this.end = d, this.unit = f || (n.cssNumber[c] ? "" : "px") }, cur: function() {var a = Wc.propHooks[this.prop]; return a && a.get ? a.get(this) : Wc.propHooks._default.get(this) }, run: function(a) {var b, c = Wc.propHooks[this.prop]; return this.pos = b = n.easing[this.easing](a, this.options.duration * a, 0, 1, this.options.duration), this.now = (this.end - this.start) * b + this.start, this.options.step && this.options.step.call(this.elem, this.now, this), c && c.set ? c.set(this) : Wc.propHooks._default.set(this), this } }, Wc.prototype.init.prototype = Wc.prototype, Wc.propHooks = {_default: {get: function(a) {var b; return null == a.elem[a.prop] || a.elem.style && null != a.elem.style[a.prop] ? (b = n.css(a.elem, a.prop, !1, ""), b && "auto" !== b ? b : 0) : a.elem[a.prop] }, set: function(a) {n.fx.step[a.prop] ? n.fx.step[a.prop](a) : a.elem.style && (null != a.elem.style[n.cssProps[a.prop]] || n.cssHooks[a.prop]) ? n.style(a.elem, a.prop, a.now + a.unit) : a.elem[a.prop] = a.now } } }, Wc.propHooks.scrollTop = Wc.propHooks.scrollLeft = {set: function(a) {a.elem.nodeType && a.elem.parentNode && (a.elem[a.prop] = a.now) } }, n.each(["toggle", "show", "hide"], function(a, b) {var c = n.fn[b]; n.fn[b] = function(d, e, f) {return null == d || "boolean" == typeof d || !a && n.isFunction(d) && n.isFunction(e) ? c.apply(this, arguments) : this.animate(Xc(b, !0), d, e, f) } }), n.fn.extend({fadeTo: function(a, b, c, d) {return this.filter(Wb).css("opacity", 0).show().end().animate({opacity: b }, a, c, d) }, animate: function(a, b, c, d) {var e = n.isEmptyObject(a), f = n.speed(b, c, d), g = function() {var b = Tc(this, n.extend({}, a), f); e && b.stop(!0) }; return e || f.queue === !1 ? this.each(g) : this.queue(f.queue, g) }, stop: function(a, c, d) {var e = function(a) {var b = a.stop; delete a.stop, b(d) }; return "string" != typeof a && (d = c, c = a, a = b), c && a !== !1 && this.queue(a || "fx", []), this.each(function() {var b = !0, c = null != a && a + "queueHooks", f = n.timers, g = n._data(this); if (c) g[c] && g[c].stop && e(g[c]); else for (c in g) g[c] && g[c].stop && Oc.test(c) && e(g[c]); for (c = f.length; c--;) f[c].elem !== this || null != a && f[c].queue !== a || (f[c].anim.stop(d), b = !1, f.splice(c, 1)); (b || !d) && n.dequeue(this, a) }) } }), n.each({slideDown: Xc("show"), slideUp: Xc("hide"), slideToggle: Xc("toggle"), fadeIn: {opacity: "show"}, fadeOut: {opacity: "hide"}, fadeToggle: {opacity: "toggle"} }, function(a, b) {n.fn[a] = function(a, c, d) {return this.animate(b, a, c, d) } }), n.speed = function(a, b, c) {var d = a && "object" == typeof a ? n.extend({}, a) : {complete: c || !c && b || n.isFunction(a) && a, duration: a, easing: c && b || b && !n.isFunction(b) && b }; return d.duration = n.fx.off ? 0 : "number" == typeof d.duration ? d.duration : d.duration in n.fx.speeds ? n.fx.speeds[d.duration] : n.fx.speeds._default, (null == d.queue || d.queue === !0) && (d.queue = "fx"), d.old = d.complete, d.complete = function() {n.isFunction(d.old) && d.old.call(this), d.queue && n.dequeue(this, d.queue) }, d }, n.easing = {linear: function(a) {return a }, swing: function(a) {return .5 - Math.cos(a * Math.PI) / 2 } }, n.timers = [], n.fx = Wc.prototype.init, n.fx.tick = function() {for (var a, b = n.timers, c = 0; c < b.length; c++) a = b[c], a() || b[c] !== a || b.splice(c--, 1); b.length || n.fx.stop() }, n.fx.timer = function(a) {a() && n.timers.push(a) && !Lc && (Lc = setInterval(n.fx.tick, n.fx.interval)) }, n.fx.interval = 13, n.fx.stop = function() {clearInterval(Lc), Lc = null }, n.fx.speeds = {slow: 600, fast: 200, _default: 400 }, n.fx.step = {}, n.expr && n.expr.filters && (n.expr.filters.animated = function(a) {return n.grep(n.timers, function(b) {return a === b.elem }).length }); var Yc = /^(?:body|html)$/i; return n.fn.offset = function(a) {if (arguments.length) return a === b ? this : this.each(function(b) {n.offset.setOffset(this, a, b) }); var c, d, e, f, g, h, i, j, k, l, m = this[0], o = m && m.ownerDocument; if (o) return (e = o.body) === m ? n.offset.bodyOffset(m) : (d = o.documentElement, n.contains(d, m) ? (c = m.getBoundingClientRect(), f = Zc(o), g = d.clientTop || e.clientTop || 0, h = d.clientLeft || e.clientLeft || 0, i = f.pageYOffset || d.scrollTop, j = f.pageXOffset || d.scrollLeft, k = c.top + i - g, l = c.left + j - h, {top: k, left: l }) : {top: 0, left: 0 }) }, n.offset = {bodyOffset: function(a) {var b = a.offsetTop, c = a.offsetLeft; return n.support.doesNotIncludeMarginInBodyOffset && (b += parseFloat(n.css(a, "marginTop")) || 0, c += parseFloat(n.css(a, "marginLeft")) || 0), {top: b, left: c } }, setOffset: function(a, b, c) {var d = n.css(a, "position"); "static" === d && (a.style.position = "relative"); var l, m, e = n(a), f = e.offset(), g = n.css(a, "top"), h = n.css(a, "left"), i = ("absolute" === d || "fixed" === d) && n.inArray("auto", [g, h]) > -1, j = {}, k = {}; i ? (k = e.position(), l = k.top, m = k.left) : (l = parseFloat(g) || 0, m = parseFloat(h) || 0), n.isFunction(b) && (b = b.call(a, c, f)), null != b.top && (j.top = b.top - f.top + l), null != b.left && (j.left = b.left - f.left + m), "using" in b ? b.using.call(a, j) : e.css(j) } }, n.fn.extend({position: function() {if (this[0]) {var a = this[0], b = this.offsetParent(), c = this.offset(), d = Yc.test(b[0].nodeName) ? {top: 0, left: 0 } : b.offset(); return c.top -= parseFloat(n.css(a, "marginTop")) || 0, c.left -= parseFloat(n.css(a, "marginLeft")) || 0, d.top += parseFloat(n.css(b[0], "borderTopWidth")) || 0, d.left += parseFloat(n.css(b[0], "borderLeftWidth")) || 0, {top: c.top - d.top, left: c.left - d.left } } }, offsetParent: function() {return this.map(function() {for (var a = this.offsetParent || e.body; a && !Yc.test(a.nodeName) && "static" === n.css(a, "position");) a = a.offsetParent; return a || e.body }) } }), n.each({scrollLeft: "pageXOffset", scrollTop: "pageYOffset"}, function(a, c) {var d = /Y/.test(c); n.fn[a] = function(e) {return n.access(this, function(a, e, f) {var g = Zc(a); return f === b ? g ? c in g ? g[c] : g.document.documentElement[e] : a[e] : (g ? g.scrollTo(d ? n(g).scrollLeft() : f, d ? f : n(g).scrollTop()) : a[e] = f, void 0) }, a, e, arguments.length, null) } }), n.each({Height: "height", Width: "width"}, function(a, c) {n.each({padding: "inner" + a, content: c, "": "outer" + a }, function(d, e) {n.fn[e] = function(e, f) {var g = arguments.length && (d || "boolean" != typeof e), h = d || (e === !0 || f === !0 ? "margin" : "border"); return n.access(this, function(c, d, e) {var f; return n.isWindow(c) ? c.document.documentElement["client" + a] : 9 === c.nodeType ? (f = c.documentElement, Math.max(c.body["scroll" + a], f["scroll" + a], c.body["offset" + a], f["offset" + a], f["client" + a])) : e === b ? n.css(c, d, e, h) : n.style(c, d, e, h) }, c, g ? e : b, g) } }) }), n }(target);
				
				_log("Local jQuery version: ", $.fn.jquery);

				if (target.$){
					_log("Target jQuery version: ", target.$.fn.jquery);
				}

				if (_HAS_TOUCH){
					// Setup local jQuery Mobile v1.3.1 | Copyright 2010, 2013 jQuery Foundation, Inc. | jquery.org/license
					
					! function(a, b, c) {c($, a, b) }(this, target.document, function(a, b, c) {! function(a, b, c, d) {function e(a) {for (; a && "undefined" != typeof a.originalEvent;) a = a.originalEvent; return a } function f(b, c) {var g, h, i, j, k, l, m, n, o, f = b.type; if (b = a.Event(b), b.type = c, g = b.originalEvent, h = a.event.props, f.search(/^(mouse|click)/) > -1 && (h = C), g) for (m = h.length, j; m;) j = h[--m], b[j] = g[j]; if (f.search(/mouse(down|up)|click/) > -1 && !b.which && (b.which = 1), -1 !== f.search(/^touch/) && (i = e(g), f = i.touches, k = i.changedTouches, l = f && f.length ? f[0] : k && k.length ? k[0] : d, l)) for (n = 0, o = A.length; o > n; n++) j = A[n], b[j] = l[j]; return b } function g(b) {for (var d, e, c = {}; b;) {d = a.data(b, x); for (e in d) d[e] && (c[e] = c.hasVirtualBinding = !0); b = b.parentNode } return c } function h(b, c) {for (var d; b;) {if (d = a.data(b, x), d && (!c || d[c])) return b; b = b.parentNode } return null } function i() {K = !1 } function j() {K = !0 } function k() {O = 0, I.length = 0, J = !1, j() } function l() {i() } function m() {n(), E = setTimeout(function() {E = 0, k() }, a.vmouse.resetTimerDuration) } function n() {E && (clearTimeout(E), E = 0) } function o(b, c, d) {var e; return (d && d[b] || !d && h(c.target, b)) && (e = f(c, b), a(c.target).trigger(e)), e } function p(b) {var c = a.data(b.target, y); if (!(J || O && O === c)) {var d = o("v" + b.type, b); d && (d.isDefaultPrevented() && b.preventDefault(), d.isPropagationStopped() && b.stopPropagation(), d.isImmediatePropagationStopped() && b.stopImmediatePropagation()) } } function q(b) {var d, f, c = e(b).touches; if (c && 1 === c.length && (d = b.target, f = g(d), f.hasVirtualBinding)) {O = N++, a.data(d, y, O), n(), l(), H = !1; var h = e(b).touches[0]; F = h.pageX, G = h.pageY, o("vmouseover", b, f), o("vmousedown", b, f) } } function r(a) {K || (H || o("vmousecancel", a, g(a.target)), H = !0, m()) } function s(b) {if (!K) {var c = e(b).touches[0], d = H, f = a.vmouse.moveDistanceThreshold, h = g(b.target); H = H || Math.abs(c.pageX - F) > f || Math.abs(c.pageY - G) > f, H && !d && o("vmousecancel", b, h), o("vmousemove", b, h), m() } } function t(a) {if (!K) {j(); var c, b = g(a.target); if (o("vmouseup", a, b), !H) {var d = o("vclick", a, b); d && d.isDefaultPrevented() && (c = e(a).changedTouches[0], I.push({touchID: O, x: c.clientX, y: c.clientY }), J = !0) } o("vmouseout", a, b), H = !1, m() } } function u(b) {var d, c = a.data(b, x); if (c) for (d in c) if (c[d]) return !0; return !1 } function v() {} function w(b) {var c = b.substr(1); return {setup: function() {u(this) || a.data(this, x, {}); var f = a.data(this, x); f[b] = !0, D[b] = (D[b] || 0) + 1, 1 === D[b] && M.bind(c, p), a(this).bind(c, v), L && (D.touchstart = (D.touchstart || 0) + 1, 1 === D.touchstart && M.bind("touchstart", q).bind("touchend", t).bind("touchmove", s).bind("scroll", r)) }, teardown: function() {--D[b], D[b] || M.unbind(c, p), L && (--D.touchstart, D.touchstart || M.unbind("touchstart", q).unbind("touchmove", s).unbind("touchend", t).unbind("scroll", r)); var f = a(this), g = a.data(this, x); g && (g[b] = !1), f.unbind(c, v), u(this) || f.removeData(x) } } } var P, x = "virtualMouseBindings", y = "virtualTouchID", z = "vmouseover vmousedown vmousemove vmouseup vclick vmouseout vmousecancel".split(" "), A = "clientX clientY pageX pageY screenX screenY".split(" "), B = a.event.mouseHooks ? a.event.mouseHooks.props : [], C = a.event.props.concat(B), D = {}, E = 0, F = 0, G = 0, H = !1, I = [], J = !1, K = !1, L = "addEventListener" in c, M = a(c), N = 1, O = 0; a.vmouse = {moveDistanceThreshold: 10, clickDistanceThreshold: 10, resetTimerDuration: 1500 }; for (var Q = 0; Q < z.length; Q++) a.event.special[z[Q]] = w(z[Q]); L && c.addEventListener("click", function(b) {var e, f, g, h, i, j, c = I.length, d = b.target; if (c) for (e = b.clientX, f = b.clientY, P = a.vmouse.clickDistanceThreshold, g = d; g;) {for (h = 0; c > h; h++) if (i = I[h], j = 0, g === d && Math.abs(i.x - e) < P && Math.abs(i.y - f) < P || a.data(g, y) === i.touchID) return b.preventDefault(), b.stopPropagation(), void 0; g = g.parentNode } }, !0) }(a, b, c), function(a) {a.mobile = {} }(a), function(a) {var d = {touch: "ontouchend" in c }; a.mobile.support = a.mobile.support || {}, a.extend(a.support, d), a.extend(a.mobile.support, d) }(a), function(a, b, d) {function e(b, c, d) {var e = d.type; d.type = c, a.event.dispatch.call(b, d), d.type = e } var f = a(c); a.each("touchstart touchmove touchend tap taphold swipe swipeleft swiperight scrollstart scrollstop".split(" "), function(b, c) {a.fn[c] = function(a) {return a ? this.bind(c, a) : this.trigger(c) }, a.attrFn && (a.attrFn[c] = !0) }); var g = a.mobile.support.touch, h = "touchmove scroll", i = g ? "touchstart" : "mousedown", j = g ? "touchend" : "mouseup", k = g ? "touchmove" : "mousemove"; a.event.special.scrollstart = {enabled: !0, setup: function() {function b(a, b) {f = b, e(c, f ? "scrollstart" : "scrollstop", a) } var f, g, c = this, d = a(c); d.bind(h, function(c) {a.event.special.scrollstart.enabled && (f || b(c, !0), clearTimeout(g), g = setTimeout(function() {b(c, !1) }, 50)) }) } }, a.event.special.tap = {tapholdThreshold: 750, setup: function() {var b = this, c = a(b); c.bind("vmousedown", function(d) {function g() {clearTimeout(l) } function h() {g(), c.unbind("vclick", i).unbind("vmouseup", g), f.unbind("vmousecancel", h) } function i(a) {h(), j === a.target && e(b, "tap", a) } if (d.which && 1 !== d.which) return !1; var l, j = d.target; d.originalEvent, c.bind("vmouseup", g).bind("vclick", i), f.bind("vmousecancel", h), l = setTimeout(function() {e(b, "taphold", a.Event("taphold", {target: j })) }, a.event.special.tap.tapholdThreshold) }) } }, a.event.special.swipe = {scrollSupressionThreshold: 30, durationThreshold: 1e3, horizontalDistanceThreshold: 30, verticalDistanceThreshold: 75, start: function(b) {var c = b.originalEvent.touches ? b.originalEvent.touches[0] : b; return {time: (new Date).getTime(), coords: [c.pageX, c.pageY], origin: a(b.target) } }, stop: function(a) {var b = a.originalEvent.touches ? a.originalEvent.touches[0] : a; return {time: (new Date).getTime(), coords: [b.pageX, b.pageY] } }, handleSwipe: function(b, c) {c.time - b.time < a.event.special.swipe.durationThreshold && Math.abs(b.coords[0] - c.coords[0]) > a.event.special.swipe.horizontalDistanceThreshold && Math.abs(b.coords[1] - c.coords[1]) < a.event.special.swipe.verticalDistanceThreshold && b.origin.trigger("swipe").trigger(b.coords[0] > c.coords[0] ? "swipeleft" : "swiperight") }, setup: function() {var b = this, c = a(b); c.bind(i, function(b) {function e(b) {f && (g = a.event.special.swipe.stop(b), Math.abs(f.coords[0] - g.coords[0]) > a.event.special.swipe.scrollSupressionThreshold && b.preventDefault()) } var g, f = a.event.special.swipe.start(b); c.bind(k, e).one(j, function() {c.unbind(k, e), f && g && a.event.special.swipe.handleSwipe(f, g), f = g = d }) }) } }, a.each({scrollstop: "scrollstart", taphold: "tap", swipeleft: "swipe", swiperight: "swipe"}, function(b, c) {a.event.special[b] = {setup: function() {a(this).bind(c, a.noop) } } }) }(a, this) });

				}

				// Load additional dependencies
				var __loadNext = function(){
					// -- Check for next dep to load ----
					for (var i in _deps){
						if (_deps[i].loaded === false && _deps[i].load === true){
							var dep = _deps[i];
							switch ((dep.type || "").toLowerCase()){
								case "css":
								case "style":
									if (target[dep.name]){
										dep.loaded = true;
										dep.lib = target[dep.name];
									}
									else{
										var css = target.document.createElement("link");
										css.setAttribute("id", dep.id);
										css.setAttribute("rel", "stylesheet");
										css.setAttribute("type", "text/css");
										css.setAttribute("href", dep.url);
										target.document.getElementsByTagName("head")[0].appendChild(css);
										_log("Load " + dep.name);
										__checkLoading(dep);
										return; //exit so as to NOT call _finalize()
									}
									break;

								case "js":
								case "javascript":
									var script = document.createElement("script");
									script.setAttribute("id", dep.id);
									script.setAttribute("src", dep.url);
									script.setAttribute("type", "text/javascript");
									document.getElementsByTagName("head")[0].appendChild(script);
									// Why not add a handler to the script.onreadystatechange event? Aside from the hassle of cross-browser
									// support, we don't care so much about when the file is loaded as we care about when the lib's object
									// is available. The __checkLoading function checks that the window[ "myLibName" ] object is available.
									_log("Load " + dep.name);
									__checkLoading(dep);
									return; //exit so as to NOT call _finalize()

								default:
									// Set as loaded, warn developer, and keep going onto next dependency
									_log("Dependency 'type' not set for: ", dep, "warn", true);
									dep.loaded = true;

							} //end switch
						} //end if dep.loaded
					} //end for-loop

					// -- If all have been loaded then finish ----
					_log("Loaded all dependencies");

					// not checking for typeof 'onCompleteCallback' because
					// it should always exist and be a function, else I want
					// to see the error so that we can fix
					onCompleteCallback.call(this);

				}; //__loadNext()

				var __checkLoading = function(dep){
					switch ((dep.type || "").toLowerCase()){
						case "js":
						case "javascript":
							if (window[dep.name]){
								__onLoaded(dep, window[dep.name]);
							}
							else{
								window.setTimeout( function(){ __checkLoading(dep); }, 20);
							}
							break;

						default:
							__onLoaded(dep);

					} //end switch
				}; //__checkLoading()

				var __onLoaded = function(dep, lib){
					_log("Loaded " + dep.name);
					dep.loaded = true;
					if (lib){
						dep.lib = lib;
					}
					__loadNext();
				}; //__onLoaded()

				// start loading deps
				__loadNext();

			} //_loadDependencies()

			function _showRewardNotification(reward, count, message, eventID){
				if (!_notifications_enabled){
					return;
				}

				var _count = count || 1;

				// If Notification is already up, then stop the existing timeout to close it.
				clearTimeout(_hideNotificationTimeout);

				if (!$("#kartkingdom-reward-notification").get(0)){
					// -- Build Reward Notification Bubble ----
					var __bubble = $("<aside/>")
						.attr({ "id": "kartkingdom-reward-notification" })
						.addClass("hidden")
						.appendTo(_gameWrapper)
						.append(
							$("<dl/>").css({
								"position": "relative",
								"z-index": "10"
							})
							.addClass("kartkingdom-rewards-list")
							.append($("<dt/>").html("KartKingdom Rewards Earned: "))
						);

					_options.dock = (_options.dock || "TR").toUpperCase();

					switch (_options.dock){
						case "BL":
							__bubble.addClass("bottom left");
							break;

						case "BR":
							__bubble.addClass("bottom right");
							break;

						case "TL":
							__bubble.addClass("top left");
							break;

						// case "TR":
						default:
							// do nothing as the default should be TR = "top right"
					}

				}
				else{
					// stop animation of bubble if currently fading out
					$("#kartkingdom-reward-notification.fading")
						.stop()
						.removeClass("fading")
						.css({
							"opacity": "",
							"display": ""
						});
				}

				// -- Populate Reward Notification Bubble ----
				var _item = $("#kartkingdom-reward-notification dl dd." + reward + "." + eventID);

				if (_item.get(0)){
					// if reward item is currently displayed then increment count
					_count = parseInt($(".kartkingdom-reward-icon", _item).attr("data-count"), 10);
					_count = isNaN(_count) || _count < 2 ? 2 : _count + 1;
					$(".kartkingdom-reward-icon", _item).attr("data-count", _count);
					_item.removeClass("hide-count");
				}
				else{
					// create reward item and add to list
					$("<dd/>")
						.addClass("kartkingdom-reward" + (_count < 2 ? " hide-count" : ""))
						.addClass(reward + " " + eventID)
						.append($("<span/>").addClass("kartkingdom-reward-icon").attr("data-count", _count))
						.append($("<div/>").addClass("kartkingdom-reward-description").append($("<span/>").html(message)))
						.prependTo($("#kartkingdom-reward-notification dl"));
				}

				// only show the 4 most recent recent rewards, trim off the rest
				$("#kartkingdom-reward-notification dl dd").slice(4).remove();

				// -- Reveal Notification Bubble ----
				if ($("#kartkingdom-reward-notification").hasClass("hidden")){
					// slide up/down hidden list
					var __cssProps;
					var __animateProps;

					if ($("#kartkingdom-reward-notification").hasClass("bottom")){
						__cssProps = { "bottom": -200 };
						__animateProps = { "bottom": 0 };
					}
					else{
						__cssProps = { "top": -200 };
						__animateProps = { "top": 0 };
					}

					$("#kartkingdom-reward-notification dl")
						.css(__cssProps)
						.animate(__animateProps, {
							"duration": _options.slide_notification_duration,
							"complete": function(){
								$(this).css({
									"top": "",
									"bottom": "",
									"width": $(this).width() + 1
								});
								setTimeout(function(){
									$("#kartkingdom-reward-notification dl").css("width", "auto");
								}, 20);
								if (_options.hide_notification_delay > 0){
									_hideNotificationTimeout = setTimeout(_hideRewardNotification, _options.hide_notification_delay);
								}
							}
						});

					$("#kartkingdom-reward-notification")
						.removeClass("hidden")
						.css("display", ""); //just in case it's still set to "none"
				}
				else{
					// reset notification timeout delay
					if (_options.hide_notification_delay > 0){
						_hideNotificationTimeout = setTimeout(_hideRewardNotification, _options.hide_notification_delay);
					}
				}

				// add Event Listener for Window-Resize and Resize
				$(target).on("resize", _onResizeRewardNotification);
				_onResizeRewardNotification(); //initial resize

			} //_showRewardNotification()

			function _hideRewardNotification(){
				$("#kartkingdom-reward-notification")
					.addClass("fading")
					.fadeOut(_options.fade_notification_duration, function(){
						$("#kartkingdom-reward-notification dl dd").remove();
						$("#kartkingdom-reward-notification").addClass("hidden").removeClass("fading").css("display", "");
						$("#kartkingdom-reward-notification dl").css("transition", "");
						$(target).off("resize", _onResizeRewardNotification);
					});
			} //_hideRewardNotification()

			function _levelComplete(){
				_log("level complete");
				// pauseFunc();

				if ($("#kartkingdom-level-complete-screen-wrapper").get(0)){
					// if end of level screen is already up, then exit
					return;
				}

				if (_player.rewards && _player.rewards.length === 0){
					// if has access but didn't earn anything then don't show end of level screen
					_resetLevel();
					return;
				}
				else if(!_isVirtualWorld && !_options.enable_producer_notifications){
					// if not in the Virtual World and the producer has not opted-in to show notifications on their site.
					_resetLevel();
					return;
				}

				// reset resize params, just in case
				// define carousel params
				_resizeCarousel = false;

				// build end of level dialog/screen
				var dialog = $("<aside/>").attr({
						"id": "kartkingdom-level-complete-screen"
					})
					.append(
						$("<header/>")
						.prop({
							"id": "vw-banner-header"
						})
						.append($("<h1/>").append($("<a/>").html("Kart Kingdom").prop({
							"title": "Kart Kingdom",
							"href": _VW_DOMAIN,
							"target": "_top"
						})))
						.append($("<h2/>").html("You've Earned"))
					)
					.append($("<div/>").addClass("vw-background"));

				if( _isVirtualWorld ){
					dialog.addClass("in-virtual-world");
				}

				// wrap dialog and add to dom
				$("<div id='kartkingdom-level-complete-screen-wrapper'/>").append(dialog).appendTo(_gameWrapper);

				if (_player.user){
					// remove notification bubble
					$("#kartkingdom-reward-notification").stop().remove();
					clearTimeout(_hideNotificationTimeout);
					$(target).off("resize", _onResizeRewardNotification);
					_notifications_enabled = false;

					_log("Events Called: ", _eventsCalled);
					if (_eventsCalled > 0){
						_log("Wait for Resources to finish loading");
						var __onAllResourcesLoaded = function(){
							_log("Waiting: Events Called: ", _eventsCalled);
							if (_eventsCalled <= 0){
								_log("All Resources Loaded, GO!");
								__buildScreen_LoggedInWithAccess(dialog);
								_that.removeEventListener(PBS.KIDS.KartKingdom.minigameEvent.RESOURCE_REQUEST_COMPLETE, __onAllResourcesLoaded);
							}
						};

						dialog.addClass("has-vw-access loading-resources");
						_that.addEventListener(PBS.KIDS.KartKingdom.minigameEvent.RESOURCE_REQUEST_COMPLETE, __onAllResourcesLoaded);
					}
					else{
						__buildScreen_LoggedInWithAccess(dialog);
					}
				}
				else if (_HAS_TOUCH && !_HAS_POINTER){
					__buildScreen_SupportedOnDevice(dialog);
				}
				else if (_player.id){
					__buildScreen_LoggedInButNoAccess(dialog);
				}
				else{
					__buildScreen_NotLoggedIn(dialog);
				}

				// add Event Listener for Window-Resize and Resize
				$(target).on("resize", _onResizeLeveCompleteScreen);
				_onResizeLeveCompleteScreen(); //initial resize

				// add close-dialog buttons
				dialog
					.append($("<button/>").addClass("close-kartkingdom-dialog-round").click(_closeLevelCompleteScreen))
					.append($("<button/>").addClass("close-kartkingdom-dialog-block").click(_closeLevelCompleteScreen));

				_dispatchEvent(PBS.KIDS.KartKingdom.minigameEvent.LEVEL_COMPLETE_OPEN);

				function __buildScreen_SupportedOnDevice(dialog){
					var message = "You could continue the fun by playing Kart Kingdom on your computer!";

					dialog.addClass("device-not-supported");
					dialog.addClass("no-vw-access");
					dialog.append(
						$("<p/>")
						.addClass("kartkingdom-call-to-action")
						.html(message)
					);
					__buildKarts($(".vw-background", dialog));
				} //__buildScreen_SupportedOnDevice()

				function __buildScreen_NotLoggedIn(dialog){
					// not logged in
					dialog.addClass("no-vw-access");
					dialog.addClass("not-logged-in");
					dialog.append(
						$("<p/>")
						.addClass("kartkingdom-call-to-action")
						.html("You could be earning cool stuff for <span class=\"extra-copy\">the new virtual world, </span>Kart Kingdom! <a href=\"" + _VW_DOMAIN + "\" target=\"_top\" >Come play with other kids!</a>")
					);
					__buildKarts($(".vw-background", dialog));
				} //__buildScreen_NotLoggedIn()

				function __buildScreen_LoggedInButNoAccess(dialog){
					// is logged in but does has not accessed the virtual world before
					dialog.addClass("is-logged-in");
					dialog.addClass("no-vw-access");
					dialog.append(
						$("<p/>")
						.addClass("kartkingdom-call-to-action")
						.html("You could be earning cool stuff for <span class=\"extra-copy\">the new virtual world, </span>Kart Kingdom! Come play with other kids!")
					)
					.append($("<a href=\"" + _VW_DOMAIN + "\" target=\"_top\" />").html("Go to Kart Kingdom").addClass("to-kart-kingdom-fat-link"));
					__buildKarts($(".vw-background", dialog));
				} //__buildScreen_LoggedInButNoAccess()

				function __buildScreen_LoggedInWithAccess(dialog){
					// is logged in and has accessed the virtual world before
					dialog.addClass("has-vw-access");
					dialog.removeClass("loading-resources");

					// populate vw-graphic window
					// build list of all rewards earned for this level/phase
					var lootlist = $("<dl/>").addClass("kartkingdom-rewards-list").append($("<dt/>").html("KartKingdom Rewards Earned: ").addClass("hidden"));

					// create reward item and add to list
					var uniqueItemsCount = 0;
					var itemsForCarousel = 6;
					var floatDelay = 0.25;
					var floatDuration = 0.75;

					for (var i in _player.rewards){
						var rewardObj = _player.rewards[i];
						if (rewardObj.reward){
							//_player.rewards.length should fail, along with any future properties which are not reward objects.
							$("<dd/>")
								.addClass(rewardObj.reward)
								.addClass("kartkingdom-reward" + (rewardObj.count && rewardObj.count > 1 ? "" : " hide-count"))
								.append($("<span/>").addClass("kartkingdom-reward-icon").attr("data-count", rewardObj.count))
								.append($("<div/>").addClass("kartkingdom-reward-description").append($("<span/>").html(rewardObj.message)))
								.appendTo(lootlist)
								.css({
									// floating transition parameters the rewards up
									"top": "180px",
									"position": "relative",
									"transition-property": "top",
									"transition-duration": floatDuration + "s",
									"transition-timing-function": "ease-out",
									"transition-delay": (Math.min(uniqueItemsCount++, itemsForCarousel - 2) * floatDelay) + "s"
								});
						}
					}

					// if needed, wrap the reward items in a carousel
					if (_player.rewards.length >= itemsForCarousel){
						var transitionObj = {
							"margin-top": "220px",
							"transition-property": "margin",
							"transition-duration": "0.3s",
							"transition-timing-function": "cubic-bezier(0.175, 0.885, 0.320, 1.275)", //easeOutBack
							"transition-delay": ((itemsForCarousel - 1) * floatDelay + floatDuration) + "s"
						};

						// add carousel buttons, masker/wrapper, and loot-list
						$(".vw-background", dialog)
							.append(
								$("<button/>")
								.addClass("rewards-carousel-nav-button scroll-left disabled")
								.css(transitionObj)
							.on("click", function(){ __rotate(1); })
							)
							.append(
							$("<div/>").addClass("rewards-carousel-masker").append( lootlist )
							.on("swipeleft"  , function(){ __rotate(-1); })
							.on("swiperight" , function(){ __rotate( 1); })
							)
							.append(
								$("<button/>")
								.addClass("rewards-carousel-nav-button scroll-right")
								.css(transitionObj)
							.on("click", function(){ __rotate( -1); })
							);

						// finitely __rotate list of earned loot
						var rotationSpeed = 500;
						_resizeCarousel = true;

						var __rotate = function(direction){
							direction = direction || -1; //if direction is null or undefined then default to -1;
							direction = direction / Math.abs(direction); //normalize to be 1 or -1

							var stepsize = _maskWidth;
							var posLeft = $(_carouselList).position().left;
							posLeft = Math.max(_scrollingBounds.left, Math.min(_scrollingBounds.right, posLeft + (direction * stepsize)));
							$(_carouselList).animate({ "left" : posLeft }, rotationSpeed);

							$(".vw-background .rewards-carousel-nav-button.scroll-right", dialog).toggleClass("disabled", (posLeft <= _scrollingBounds.left + 2));
							$(".vw-background .rewards-carousel-nav-button.scroll-left", dialog).toggleClass("disabled", (posLeft >= _scrollingBounds.right - 2));

						}; //__rotate()

					}
					else{
						lootlist.appendTo($(".vw-background", dialog));
					}

					// build the players virtual world avatar and display in the corner
					if( PBS.KIDS.KartKingdom.avatar && _player.avatar ){
						_avatarAnim = new PBS.KIDS.KartKingdom.avatar( $(".vw-background", dialog), {
							"avatar": _player.avatar,
							"scale": "0.25",
							worldDomain: _VW_DOMAIN,
							assetsDomain: _ASSETS_DOMAIN
						});
					}

					// float rewards and nav buttons up
					setTimeout(function(){
						$(".kartkingdom-reward", dialog).css({ "top": "0px" });
						if (_player.rewards.length >= itemsForCarousel){
							$(".rewards-carousel-nav-button", dialog).css({ "margin-top": "0px" });
						}
					}, 100);

				} //__buildScreen_LoggedInWithAccess()

				function __buildKarts(parent){
					var kartsList = $("<ul/>").addClass("karts").appendTo(parent);

					for(var k=0 ; k < 3; k++){
						kartsList.append(
							$("<li class=\"kart\"/>").css({
								"left": (720) + "px",
								"position": "relative",
								"transition-property": "left",
								"transition-duration": (1.5) + "s",
								"transition-timing-function": "ease-out",
								"transition-delay": (k * 0.25) + "s"
							})
						);
					}

					// animate karts into scene
					setTimeout(function(){
						$(".kart", kartsList).css({"left": "0px"});
					}, 200);
				} //__buildKarts()

			} //_levelComplete()

			function _closeLevelCompleteScreen(){
				_log("Close Level-Complete Screen");
				$("#kartkingdom-level-complete-screen-wrapper").remove();
				_dispatchEvent(PBS.KIDS.KartKingdom.minigameEvent.LEVEL_COMPLETE_CLOSED);
				_resetLevel();

				// reset resize params and remove onResize Handler
				_resizeCarousel = false;
				$(target).off("resize", _onResizeLeveCompleteScreen);

			} //_closeLevelCompleteScreen()

			function _resetLevel(){
				_player.rewards = { length: 0 };
				_notifications_enabled = _options.enable_notifications && (_isVirtualWorld || _options.enable_producer_notifications);
				_dispatchEvent(PBS.KIDS.KartKingdom.minigameEvent.LEVEL_RESET);
			} //_resetLevel()

			function _event(eventID){
				if (!_player.user){
					return;
				}
				_log("dispatch game event '" + eventID + "' to kartkingdom backend");

				_eventsCalled++;

				var ajaxID = "ajax_" + (_ajaxID ++);
				_activeAjaxRequests[ajaxID] = $.ajax({
					url: _REWARDS_API + "event/" + eventID + "/",
					type: "post",

					// prevent double rewards when playing in virtual world
					data: (_isVirtualWorld && _vwChannel) ? {} : { "update": 1 },

					xhrFields: {
			    	withCredentials: true
					},

					complete: function(){
						_eventsCalled--;
						_dispatchEvent(PBS.KIDS.KartKingdom.minigameEvent.RESOURCE_REQUEST_COMPLETE);
						delete _activeAjaxRequests[ajaxID];
					},

					success: function(response){
						var __onCurrencyComplete = function(response){
							_log("Channel.updateCurrency() complete", response);
						};

						var __onCurrencyFailed = function(response){
							_log("Channel.updateCurrency() failed", response, "warn");
						};

						var __onUnlockComplete = function(response){
							_log("Channel.unlockCraftingProductByIdentifier( " + response.unlocked[i] + " ) complete", response);
						};

						var __onUnlockFailed = function(response){
							_log("Channel.unlockCraftingProductByIdentifier( " + response.unlocked[i] + " ) failed", response, "warn");
						};

						_log("loaded \"/kartkingdom/api/reward/\" : ", response);

						_dispatchEvent(PBS.KIDS.KartKingdom.minigameEvent.RESOURCES_EARNED, {
							"resources": (response.rewards || {})
						});

						// _unlockCraftingProductByIdentifier
						if (response.rewards){
							for (var reward in response.rewards){
								_log("save new rewards earned");
								// Add reward to the "rewards new" object. This object stores
								// each reward for each event-type so that it can display each
								// reward with its unique message at the end of the level. This
								// pairing of event-type and reward-type is needed because some
								// rewards can be earned via multiple events and some events
								// return multiple rewards (many-to-many).
								var uid = reward + "_" + response.guid;

								if (!_player.rewards[uid]){
									_player.rewards.length++;
									_player.rewards[uid] = {
										"reward": reward,
										"message": response.message,
										"count": response.rewards[reward]
									};
								}
								else{
									_player.rewards[uid].count += response.rewards[reward];
								}

								// show reward in the notificiion bubble
								_showRewardNotification(reward, response.rewards[reward], response.message, response.guid);

								// if in virtual world then immediately add currency to user
								if (_isVirtualWorld && _vwChannel){
									_vwChannel.call({
										method: "updateCurrency",
										params:{
											currencyName: reward,
											amountChanged: response.rewards[reward]
										},
										success: __onCurrencyComplete,
										error: __onCurrencyFailed
									});
								}

								_log("new reward: '" + reward + "', count: " + response.rewards[reward], "info");

							} //end for

							_log("Rewards: ", _player.rewards);
						}
						else{
							_log(response.message, response, "warn", true);
						}

						// if in virtual world then immediately unlock resources
						if (response.unlocked && _isVirtualWorld && _vwChannel){
							for (var i = 0; i < response.unlocked.length; i++){
								_log("Unlock Crafting Product: ", response.unlocked[i]);
								_vwChannel.call({
									method: "unlockCraftingProductByIdentifier",
									params:{ productIdentifier: response.unlocked[i] },
									success: __onUnlockComplete,
									error: __onUnlockFailed
								});
							}
						}
					}
				});

			} //_event()

			function _hasPowerUp(powerupName){
				return (_player.powerups && _player.powerups[powerupName] && !isNaN(_player.powerups[powerupName].quantity) ? Math.max(_player.powerups[powerupName].quantity, 0) : false);
			} //__hasPowerUp()

			function _usePowerUps(powerups, onSuccess, onFailure){
				_log("usePowerUps() :: powerups = ", powerups);

				if (!onSuccess || typeof onSuccess !== "function"){
					_log("Please supply an onSuccess callback method.", null, "warn");
					return false;
				}

				var __onSuccess = function(){
					_log("Updated Powerups: ", _player.powerups, "info");

					_dispatchEvent(PBS.KIDS.KartKingdom.minigameEvent.POWERUP_CONSUMED, {
						"powerups": powerups
					});

					// call the games onSuccess method to
					// let them know that the vw has accepted
					// the request to consume the item(s)
					onSuccess();
				};

				var __onFailure = function(message){
					_log(message, null, "warn");

					_dispatchEvent(PBS.KIDS.KartKingdom.minigameEvent.POWERUP_CONSUME_FAILED, {
						"powerups": powerups,
						"message": message
					});

					// if provided, call the games onFailure method
					// to let them know that the vw could not complete
					// the request to consume the item(s)
					if (onFailure && typeof onFailure === "function"){
						onFailure();
					}

					return false;
				};

				// Check that the powerups object exists and is non-empty
				if (!powerups || typeof powerups !== "object"){
					return __onFailure("powerups object does not exist or is not an {Object}");
				}
				else{
					var isEmpty = true;
					for (var prop in powerups){
						if (powerups.hasOwnProperty(prop)){
							isEmpty = false;
							break;
						}
					}
					if (isEmpty){
						return __onFailure("powerups object is empty");
					}
				}

				for (var powerupName in powerups){
					// powerups[powerupName] = the quantity to use of that resource
					// { "wheel" : 3 }: powerupName = "wheel", powerups[ powerupName ] = 3

					// Check if the game supplied an actual quantity of the resource to use
					powerups[powerupName] = parseInt(powerups[powerupName], 10);
					if (isNaN(powerups[powerupName])){
						return __onFailure("the quantity of " + powerupName + " to use is not an integer");
					}

					// Make sure the amount is positive for comparison
					powerups[powerupName] = Math.abs(powerups[powerupName]);

					// Check if the user has enough of each resource
					var c = _hasPowerUp(powerupName);
					if (!c || c < powerups[powerupName]){
						return __onFailure("the user does not have enough " + powerupName + "s to use");
					}
					else{
						// negate the quantity of each resource prior to sending ajax request
						powerups[powerupName] *= -1;
					}
				}

				var ajaxID = "ajax_" + (_ajaxID ++);
				_activeAjaxRequests[ajaxID] = $.ajax({
					url: _REWARDS_API + "used_resource/",
					type: "post",
					data:{ "resources": JSON.stringify(powerups) },
					complete: function(){
						delete _activeAjaxRequests[ajaxID];
					},
					success: function(response){
						_log("usePowerUps() > onSuccess() :: response = ", response);

						var __onRemoveComplete = function(response){
							_log("Channel.removeProduct() complete", response);
						};

						var __onRemoveFailed = function(response){
							_log("Channel.removeProduct() failed", response, "warn");
						};

						// update the players powerups
						for (var powerupName in powerups){
							_player.powerups[powerupName].quantity += powerups[powerupName]; //powerups[powerupName] should at this point be a negative value, hence using "+=".

							if (_isVirtualWorld && _vwChannel){
								// if in virtual world then immediately remove product from user
								_vwChannel.call({
									method: "removeProduct",
									params: {
										product: {
											id: _player.powerups[powerupName].id
										},
										quantity: -powerups[powerupName] //should at this point be a negative value, hence using -resource[powerupName]
									},
									success: __onRemoveComplete,
									error: __onRemoveFailed
								});
							}
						}//endFor

						__onSuccess();

					},
					error: function(){
						__onFailure("Virtual World Backend could not complete the request to consume the powerup(s)");
					}
				});

				return true; //Not the same as __onSuccess(), just means __onFailure has occurred yet.

			} //__usePowerUps()

			this.destroy = function(){ _destroy(); };
			this.event = function( eventType ){ _event( eventType ); };

			this.levelComplete = function(){ _levelComplete(); };
			this.levelcomplete = this.levelComplete;

			this.hasPowerUp  = function( powerupName ) { return _hasPowerUp( powerupName ); };
			this.hasPowerup = this.hasPowerUp;
			this.haspowerup = this.hasPowerUp;

			this.usePowerUps = function( powerupsObject, onSuccessCallback, onFailureCallback ) { return _usePowerUps( powerupsObject, onSuccessCallback, onFailureCallback ); };
			this.usePowerups = this.usePowerUps;
			this.usepowerups = this.usePowerUps;

			this.removeEventListener = function(type, listener){ _removeEventListener(type, listener); };
			this.removeeventlistener = this.removeEventListener;

			this.addEventListener = function(type, listener){ _addEventListener(type, listener); };
			this.addeventlistener = this.addEventListener;

			this.jQuery = $;

		};

		//Assign to namespace
		if( typeof(namespace) === "function" ){
			namespace("springroll.pbskids.kartkingdom").Minigame = PBS.KIDS.KartKingdom.minigame;
		}

		return PBS.KIDS.KartKingdom.minigame;

	}));
}());

/*! SpringRoll PBSKIDS Container 0.2.10 */
/**
 * @module Container
 * @namespace springroll.pbskids
 */
(function(undefined)
{
	// Import classes
	var localStorage = include('localStorage');
	var UUID;

	var $ = include('jQuery');

	/**
	 * Buffer event
	 * @class BufferedQueue
	 * @constructor
	 * @param {int} batchSize The number of events to buffer
	 * @param {string} keyPrefix The prefix key for local storage
	 * @param {string} eventServiceUrl The url
	 */
	var BufferedQueue = function(batchSize, keyPrefix, eventServiceUrl)
	{
		if (UUID === undefined)
		{
			UUID = include('springroll.pbskids.UUID');
		}

		/**
		 * If we're online
		 * @property {boolean} onlineStatus
		 */
		this.onlineStatus = true;

		/**
		 * The buffer timer check
		 * @property {int} timer
		 */
		this.timer = null;

		/**
		 * The buffer timer check
		 * @property {array} currentBatch
		 */
		this.currentBatch = [];

		/**
		 * The keys intransit
		 * @property {object} inTransitKeys
		 */
		this.inTransitKeys = {};

		/**
		 * The buffer key prefix
		 * @property {string} keyPrefix
		 */
		this.keyPrefix = keyPrefix;

		/**
		 * The number of events to buffer
		 * @property {int} batchSize
		 */
		this.batchSize = batchSize;

		/**
		 * Path to the end-point
		 * @property {String} eventServiceUrl
		 */
		this.eventServiceUrl = eventServiceUrl;

		/**
		 * The name of the localstorage name for the queue
		 * @property {String} queueName
		 */
		this.queueName = 'bufferQueue' + UUID.genV4().hexString;

		this.resetKey();
	};

	// Reference to the prototype
	var p = BufferedQueue.prototype;

	/**
	 * Process the batch of events
	 * @method processBatch
	 * @param {string} key The key to process
	 * @return {boolean} If the event is being processed
	 */
	p.processBatch = function(key)
	{
		var keys = this.inTransitKeys;
		if (keys[key] === undefined)
		{
			var queueName = this.queueName;
			keys[key] = 0;
			$.ajax(
			{
				url: this.eventServiceUrl,
				data: localStorage.getItem(key),
				type: "POST",
				contentType: "application/json",
				dataType: "json",
				success: function()
				{
					removeFromQueue(queueName, key);
					localStorage.removeItem(key);
					delete keys[key];
				},
				error: function(response)
				{
					if (true && window.console)
					{
						console.error("Response", response);
					}
					if (response.status == 400)
					{
						//400 is invalid
						//data response from server for events
						removeFromQueue(queueName, key);
						localStorage.removeItem(key);
					}
					delete keys[key];
				}
			});
			return true;
		}
		else
		{
			return false;
		}
	};

	/**
	 * Remove an item to the queue by key
	 * @method  removeFromQueue
	 * @private
	 * @param {String} queueName The name of the queue to remove from
	 * @param {String} key The key of the item to remove
	 */
	var removeFromQueue = function(queueName, key)
	{
		var bufferQueue = getBufferQueue(queueName);
		var index = bufferQueue.indexOf(key);
		if (index > -1)
		{
			bufferQueue.splice(index, 1);
			localStorage.setItem(queueName, JSON.stringify(bufferQueue));
		}
	};

	/**
	 * Add an item to the queue
	 * @method  addToQueue
	 * @private
	 * @param {String} queueName The name of the queue
	 * @param {String} key The key of the item to push
	 */
	var addToQueue = function(queueName, key)
	{
		var bufferQueue = getBufferQueue(queueName);
		var index = bufferQueue.indexOf(key);

		// Only add the key once
		if (index === -1)
		{
			bufferQueue.push(key);
			localStorage.setItem(queueName, JSON.stringify(bufferQueue));
		}
	};

	/**
	 * Add an item to the queue
	 * @method  getBufferQueue
	 * @private
	 * @param {String} queueName The name of the queue to retrieve
	 * @return {Array} The list of keys
	 */
	var getBufferQueue = function(queueName)
	{
		try
		{
			return JSON.parse(localStorage.getItem(queueName)) || [];
		}
		catch (e)
		{}
		return [];
	};

	/**
	 * Start the buffer timer
	 * @method startTimer
	 */
	p.startTimer = function()
	{
		this.stopTimer();
		this.timer = setInterval(
			this._onTimerTick.bind(this),
			1000
		);
	};

	/**
	 * When the timer updates
	 * @method onTimerTick
	 * @private
	 */
	p._onTimerTick = function()
	{
		if (!this.onlineStatus) return;

		var bufferQueue = getBufferQueue(this.queueName);

		for (var i = 0; i < bufferQueue.length; i++)
		{
			if (this.processBatch(bufferQueue[i]))
			{
				break;
			}
		}
	};

	/**
	 * Stop the buffer timer
	 * @method stopTimer
	 */
	p.stopTimer = function()
	{
		clearInterval(this.timer);
		this.timer = null;
	};

	/**
	 * Enable the queue
	 * @method enable
	 */
	p.enable = function()
	{
		this.inTransitKeys = {};
		this.currentBatch.length = 0;
		this.resetKey();
		this.startTimer();
	};

	/**
	 * Disable the queue
	 * @method disable
	 */
	p.disable = function()
	{
		this.stopTimer();
	};

	/**
	 * Autoflush the event queue
	 * @method setAutoFlush
	 * @param {Boolean} on If we should autoflush
	 */
	p.setAutoFlush = function(on)
	{
		if (!on)
		{
			this.stopTimer();
		}
		else if (!this.timer)
		{
			this.startTimer();
		}
	};

	/**
	 * Set the online status
	 * @method setOnline
	 * @param {Boolean} isOnline If we are online
	 */
	p.setOnline = function(isOnline)
	{
		this.onlineStatus = isOnline;
	};

	/**
	 * Push a new event
	 * @method pushEvent
	 * @param {object} event THe event data
	 */
	p.pushEvent = function(event)
	{
		this.inTransitKeys[this.bufferKey] = 0;
		this.currentBatch.push(event);

		localStorage.setItem(this.bufferKey, JSON.stringify(this.currentBatch));
		addToQueue(this.queueName, this.bufferKey);

		if (this.currentBatch.length >= this.batchSize)
		{
			this.currentBatch.length = 0;
			delete this.inTransitKeys[this.bufferKey];
			this.resetKey();
		}
	};

	/**
	 * Flush all the event
	 * @method flushAll
	 */
	p.flushAll = function()
	{
		this.currentBatch.length = 0;
		delete(this.inTransitKeys[this.bufferKey]);
		this.resetKey();

		if (!this.timer)
		{
			//timer is not running hence manually flush
			var bufferQueue = getBufferQueue(this.queueName);

			for (var i = 0; i < bufferQueue.length; i++)
			{
				this.processBatch(bufferQueue[i]);
			}
		}
	};

	/**
	 * Reset the buffer key
	 * @method resetKey
	 */
	p.resetKey = function()
	{
		this.bufferKey = this.keyPrefix + UUID.genV4().hexString;
	};

	/**
	 * End and clear the buffer
	 * @method end
	 */
	p.end = function()
	{
		this.currentBatch.length = 0;
		delete(this.inTransitKeys[this.bufferKey]);
		this.resetKey();
	};

	/**
	 * Destroy and don't use after this
	 * @method destroy
	 */
	p.destroy = function()
	{
		this.end();
		this.currentBatch = null;
		this.inTransitKeys = null;
		this.stopTimer();
	};

	// Assign to namespace
	namespace('springroll.pbskids').BufferedQueue = BufferedQueue;

}());
/**
 * @module Container
 * @namespace springroll.pbskids
 */
(function()
{
	// Import classes
	var UUID;
	var BufferedQueue;
	var Platform;
	var Identity;

	/**
	 * A module that consumers can use to expose Super Vision kid labels to this plugin. Basically, the 
	 * "PBS.KIDS.CurrentKidLabel" (if it exists), should be an object with a get and set method to allow "setters" to
	 * update the value on the fly, so that this plugin can always get the latest value when needed
	 *
	 * @var {Object} CurrentKidLabel
	 */
	var CurrentKidLabel;

	/**
	 * A module that consumers can use to expose the Super Vision channel id to this plugin. Basically, the
	 * "PBS.KIDS.CurrentChannelId" (if it exists), should be an object witha get and set method to allow "setters" to
	 * update the value on the fly, so that this plugin can always get the latest value when needed
	 *
	 * @var {Object} CurrentChannelId
	 */
	var CurrentChannelId;

	/**
	 * A module that consumers can use to expose the a content origin to this plugin. Basically, the
	 * "PBS.KIDS.ContentOrigin" (if it exists), should be an object with a get and set method to allow "setters" to
	 * update the value on the fly, so that this plugin can always get the latest value when needed. For instance, a value
	 * might look like "org.pbskids.measureup", or "org.pbskids.gamesapp" to distinguish *where* the event came from. As
	 * more Springroll games get embedded in multiple places, this will be valuable when wanting to filter those events
	 * based on *where* the game was played (Measure Up vs. pbskids.org vs. Games vs. whatever)
	 *
	 * @var {Object} ContentOrigin
	 */
	var ContentOrigin;

	/**
	 * Handle the Learning Analytics events
	 * @class LearningAnalytics
	 * @constructor
	 * @param {string} [domain='http://progresstracker.pbskids.org'] The domain for the end-point
	 *        this should only be set for mobile devices or testing otherwise
	 *        it uses a root-relative end-point and will use the progresstracker
	 *        on the current domain
	 * @param {string} [resource='game'] The type of resource
	 */
	var LearningAnalytics = function(domain, resource)
	{
		if (UUID === undefined)
		{
			UUID = include('springroll.pbskids.UUID');
			BufferedQueue = include('springroll.pbskids.BufferedQueue');
			Platform = include('springroll.pbskids.Platform');
			Identity = include('PBS.KIDS.identity', false);
			CurrentKidLabel = include('PBS.KIDS.CurrentKidLabel', false);
			CurrentChannelId = include('PBS.KIDS.CurrentChannelId', false);
			ContentOrigin = include('PBS.KIDS.ContentOrigin', false);
		}

		// Param defaults
		resource = resource || 'game';
		domain = domain || 'http://progresstracker.pbskids.org:8000';

		// Determine the service path to use
		var servicePath = SERVICE_PATHS.v1;

		/**
		 * The valid event keys for the resource type
		 * @property {array} eventKeys
		 * @private
		 */
		this.eventKeys = EVENT_KEYS.v1;

		// Upgrade to version 2 of the API
		if (resource && !!SERVICE_PATHS.v2[resource])
		{
			servicePath = SERVICE_PATHS.v2[resource];
			this.eventKeys = EVENT_KEYS.v2[resource];
		}

		/**
		 * Queuing object for the event buffer
		 * @property {pbskids.BufferedQueue} queue
		 */
		this.queue = new BufferedQueue(
			BATCH_SIZE,
			KEY_PREFIX,
			domain + servicePath
		);

		/**
		 * For getting platform details
		 * @property {pbskids.Platform} platform
		 */
		this.platform = new Platform();

		/**
		 * This variable contains the Session Id for current play session.
		 * @property {string} sessionId
		 */
		this.sessionId = null;

		/**
		 * The setInterval ping to check online status
		 * @property {int} _timer
		 * @private
		 */
		this._timer = null;

		/**
		 * Internal enabled boolean
		 * @property {Boolean} _enabled
		 * @private
		 * @default true
		 */
		this._enabled = false;

		// Create a new session id
		this.resetSessionId();

		// Enable the tracker by default
		this.enabled = false;
	};

	/**
	 *  The prefix for the event data
	 *  @property {string} KEY_PREFIX
	 *  @private
	 *  @default 'PBS_event_'
	 *  @static
	 *  @readOnly
	 */
	var KEY_PREFIX = 'PBS_event_';

	/**
	 *  The root-relative service URL pathing
	 *  @property {object} SERVICE_PATHS
	 *  @private
	 *  @static
	 *  @readOnly
	 */
	var SERVICE_PATHS = {
		v2:
		{
			video: '/progresstracker/api/v2/videos/events.json',
			game: '/progresstracker/api/v2/games/events.json'
		},
		v1: '/progresstracker/api/v1/rawevents.json'
	};

	/**
	 *  The batch size of the queue
	 *  @property {int} BATCH_SIZE
	 *  @private
	 *  @default 5
	 *  @static
	 *  @readOnly
	 */
	var BATCH_SIZE = 5;

	/**
	 *  JSON object keys for validation
	 *  @property {object} EVENT_KEYS
	 *  @private
	 *  @static
	 *  @readOnly
	 */
	var EVENT_KEYS = {
		v2:
		{
			game: [
				'timestamp',
				'user_ids',
				'game_id',
				'device_id',
				'platform_id',
				'event_id',
				'event_data',
				'game_session'
			],
			video: [
				'timestamp',
				'user_ids',
				'video_id',
				'device_id',
				'platform_id',
				'event_id',
				'event_data',
				'video_session'
			]
		},
		v1: [
			'timestamp',
			'user_ids',
			'game_id',
			'device_id',
			'platform_id',
			'event_id',
			'event_data',
			'game_session'
		]
	};

	// Reference to the prototype
	var p = LearningAnalytics.prototype;

	/**
	 * Reset the current session id
	 * @method resetSessionId
	 */
	p.resetSessionId = function()
	{
		this.sessionId = UUID.genV4().hexString + UUID.genV4().hexString;
	};

	/**
	 * End the current queue
	 * @method end
	 */
	p.end = function()
	{
		this.queue.end();
	};

	/**
	 * If the queueing should autoflush
	 * @property {boolean} autoFlush
	 */
	p.setAutoFlush = function(autoFlush)
	{
		this.queue.setAutoFlush(autoFlush);
	};

	/**
	 * Check the online status internally on a timer
	 * Auto calling function to keep updating online staus
	 * @method checkStatus
	 * @private
	 */
	p.checkStatus = function()
	{
		this.queue.setOnline(navigator.onLine);
	};

	/**
	 * If the tracking is enabled
	 * @property {boolean} enabled
	 * @default true
	 */
	Object.defineProperty(p, 'enabled',
	{
		get: function()
		{
			return this._enabled;
		},
		set: function(enabled)
		{
			this._enabled = enabled;

			if (this._timer)
			{
				clearInterval(this._timer);
				this._timer = null;
			}

			if (enabled)
			{
				this._timer = setInterval(this.checkStatus.bind(this), 10000);
				this.queue.enable();
			}
			else
			{
				this.queue.disable();
			}
		}
	});

	/**
	 * Flush the queue
	 * @method flushAll
	 */
	p.flushAll = function()
	{
		this.queue.flushAll();
	};

	/**
	 * Insert Game SessionId in JSON Data
	 * @method appendSessionId
	 * @private
	 * @param {object} eventData The event object
	 * @return {LearningAnalytics} Instance for chaining
	 */
	p.appendSessionId = function(eventData)
	{
		eventData.game_session = this.sessionId;
		return this;
	};

	/**
	 * Insert platform in JSON Data
	 * @method appendPlatformDetails
	 * @private
	 * @param {object} eventData The event object data
	 * @return {LearningAnalytics} Instance for chaining
	 */
	p.appendPlatformDetails = function(eventData)
	{
		eventData.platform_id = this.platform.browser;
		eventData.device_id = this.platform.OS;
		return this;
	};

	/**
	 * Insert user information in JSON Data
	 * @method appendUserData
	 * @private
	 * @param {object} eventData The event object data
	 * @return {LearningAnalytics} Instance for chaining
	 */
	p.appendUserData = function(eventData)
	{
		if (Identity)
		{
			eventData.user_ids = [];
			var users = Identity.getCurrentUsers();
			for (var i = 0; i < users.length; i++)
			{
				eventData.user_ids.push(users[i].userid);
				eventData.is_logged_in = users[i].isloggedin;
			}
		}

		// If clients have defined a "PBS.KIDS.CurrentKidLabel" module, we'll also include the kid label there as well
		if (CurrentKidLabel instanceof Object)
		{
			eventData.kid_label_guid = CurrentKidLabel.get();
		}

		return this;
	};

	/**
	 * Adds the current super vision channel id to the event JSON data
	 * @method appendChannelId
	 * @private
	 * @param {object} eventData The event object data
	 * @return {LearningAnalytics} Instance for chaining
	 */
	p.appendChannelId = function(eventData)
	{
		// If clients have defined a "PBS.KIDS.CurrentChannelId" module, we'll also include the channel id as well
		if (CurrentChannelId instanceof Object)
		{
			eventData.channel_id = CurrentChannelId.get();
		}

		return this;
	};

	/**
	 * Adds the current Super Vision content origin to the event JSON data
	 * @method appendContentOrigin
	 * @private
	 * @param {Object} eventData The event object data
	 * @return {LearningAnalytics} Instance for chaining
	 */
	p.appendContentOrigin = function(eventData)
	{
		// If clients have defined a content origin, we'll attach it
		if (ContentOrigin instanceof Object)
		{
			eventData.content_origin = ContentOrigin.get();
		}

		return this;
	};

	/**
	 * Add the timestamp to the event JSON data
	 * @method appendTimeStamp
	 * @private
	 * @param {object} eventData The event object data
	 * @return {LearningAnalytics} Instance for chaining
	 */
	p.appendTimeStamp = function(eventData)
	{
		var da = new Date();
		eventData.timestamp = da.getTime();
		return this;
	};

	/**
	 * Push a learning event
	 * @method pushEvent
	 * @param {object} eventData The event object data
	 * @param {string} eventData.game_id The GUID for the game
	 * @param {string} eventData.event_id The GUID for the event
	 * @param {object} eventData.event_data The data for event
	 * @return {object} The event data with any appended data
	 */
	p.pushEvent = function(eventData)
	{
		// Ignore if we aren't enabled
		if (!this._enabled)
		{
			return this;
		}

		if (eventData.user_ids === undefined)
		{
			eventData.user_ids = [];
		}

		eventData.is_logged_in = false;

		this.appendTimeStamp(eventData)
			.appendSessionId(eventData)
			.appendPlatformDetails(eventData)
			.appendUserData(eventData)
			.appendChannelId(eventData)
			.appendContentOrigin(eventData);

		if (this.validateEvent(eventData))
		{
			this.queue.pushEvent(eventData);
		}
		return eventData;
	};

	/**
	 * Validate Event JSON data
	 * @method validateEvent
	 * @param {object} eventData
	 * @private
	 * @return {Boolean} if the event is valid
	 */
	p.validateEvent = function(eventData)
	{
		for (var i = 0; i < this.eventKeys.length; i++)
		{
			if (!validateKey(eventData[this.eventKeys[i]]))
			{
				return false;
			}
		}
		return true;
	};

	/**
	 * Validate event data keys from EVENT_KEYS
	 * @method validateKaye
	 * @private
	 * @param {object} key Validate
	 * @return {boolean} If the key is valid
	 */
	var validateKey = function(key)
	{
		return !(key === null || key == 'undefined' || key === '');
	};

	/**
	 * Cleanup and don't use after this
	 * @method destroy
	 */
	p.destroy = function()
	{
		this.enabled = false;
		this.queue.destroy();
		this.queue = null;

		this.platform = null;
	};

	// Assign to namespace
	namespace('springroll.pbskids').LearningAnalytics = LearningAnalytics;

}());
/**
 * @module Container
 * @namespace springroll
 */
(function()
{
	/**
	 * @class Container
	 */
	var plugin = new springroll.ContainerPlugin();

	plugin.setup = function()
	{
		// Import classes
		var LearningAnalytics = include('springroll.pbskids.LearningAnalytics');

		/**
		 * The Learning Analytics client for sending events 
		 * @property {springroll.pbskids.LearningAnalytics} learning
		 */
		this.learning = new LearningAnalytics(
			this.options.learningDomain,
			this.options.learningResource
		);
	};

	plugin.open = function()
	{
		// Enable the analytics dispatcher if we're in production mode
		this.learning.enabled = this.isProduction;

		var learningHandler = onLearningEvent.bind(this);

		// Client is setup, listen for learning event
		this.client.on(
		{
			learningEvent: learningHandler,
			progressEvent: learningHandler // @deprecated
		});
	};

	/**
	 * Track an event for springroll Learning
	 * @method onLearningEvent
	 * @param {event} event The bellhop learningEvent
	 * @private
	 */
	var onLearningEvent = function(event)
	{
		var data = event.data;

		// Send to the logging service
		this.loggingService.send('pt-event', data);

		// Automatically track with analytics
		this.learning.pushEvent(data);

		/**
		 * Event when dispatching a Learning Dispatcher event
		 * @event learningEvent
		 * @param {object} data The event data
		 */
		this.trigger('learningEvent', data);
	};

	plugin.close = function()
	{
		if (this.learning)
		{
			this.learning.enabled = false;
			this.client.off('learningEvent');
			this.client.off('progressEvent'); // @deprecated
		}
	};

	plugin.teardown = function()
	{
		if (this.learning)
		{
			this.learning.destroy();
			delete this.learning;
		}
	};

}());
/**
 * @module Container
 * @namespace springroll.pbskids
 */
(function()
{
	/**
	 * Utility class for detecting platform.
	 * @class Platform
	 */
	var Platform = function()
	{
		/**
		 * The name of the browser
		 * @property {string} browser
		 */
		this.browser = this.searchString(BROWSERS) || "unknown browser";

		/**
		 * The version of the user agent or app
		 * @property {string} version
		 */
		this.version = this.searchVersion(navigator.userAgent) ||
			this.searchVersion(navigator.appVersion) ||
			"unknown version";

		/**
		 * The version search string
		 * @property {string} versionSearchString
		 * @private
		 */
		this.versionSearchString = null;

		/**
		 * The current verison of the operating system
		 * @property {string} OS 
		 */
		this.OS = this.searchString(OSES) || "unknown OS";
	};

	// reference to the prototype
	var p = Platform.prototype;

	/**
	 * Search a string
	 * @method searchString
	 * @param {string|Array} data The collection of dat ato search
	 * @return {null|String} The result or null
	 */
	p.searchString = function(data)
	{
		for (var i = 0; i < data.length; i++)
		{
			var dataString = data[i].string;
			var dataProp = data[i].prop;
			this.versionSearchString = data[i].versionSearch || data[i].identity;
			if (dataString)
			{
				if (dataString.indexOf(data[i].subString) != -1)
				{
					return data[i].identity;
				}
			}
			else if (dataProp)
			{
				return data[i].identity;
			}
		}
	};

	/**
	 *  Get the version for a string
	 *  @method searchVersion
	 *  @param {string} dataString The version to search for
	 *  @return {null|number} The version number
	 */
	p.searchVersion = function(dataString)
	{
		var index = dataString.indexOf(this.versionSearchString);
		if (index == -1) return;
		return parseFloat(dataString.substring(index + this.versionSearchString.length + 1));
	};

	/**
	 *  The collection of BROWSERS types
	 *  @property {array} BROWSERS
	 *  @static
	 *  @readOnly
	 *  @private
	 */
	var BROWSERS = [
	{
		string: navigator.userAgent,
		subString: "Chrome",
		identity: "Chrome"
	},
	{
		string: navigator.userAgent,
		subString: "OmniWeb",
		versionSearch: "OmniWeb/",
		identity: "OmniWeb"
	},
	{
		string: navigator.vendor,
		subString: "Apple",
		identity: "Safari",
		versionSearch: "Version"
	},
	{
		prop: window.opera,
		identity: "Opera",
		versionSearch: "Version"
	},
	{
		string: navigator.vendor,
		subString: "iCab",
		identity: "iCab"
	},
	{
		string: navigator.vendor,
		subString: "KDE",
		identity: "Konqueror"
	},
	{
		string: navigator.userAgent,
		subString: "Firefox",
		identity: "Firefox"
	},
	{
		string: navigator.vendor,
		subString: "Camino",
		identity: "Camino"
	},
	{ // for newer Netscapes (6+)
		string: navigator.userAgent,
		subString: "Netscape",
		identity: "Netscape"
	},
	{
		string: navigator.userAgent,
		subString: "MSIE",
		identity: "Explorer",
		versionSearch: "MSIE"
	},
	{
		string: navigator.userAgent,
		subString: "Gecko",
		identity: "Mozilla",
		versionSearch: "rv"
	},
	{ // for older Netscapes (4-)
		string: navigator.userAgent,
		subString: "Mozilla",
		identity: "Netscape",
		versionSearch: "Mozilla"
	}];

	/**
	 *  The collection of OS types
	 *  @property {array} OSES
	 *  @static
	 *  @readOnly
	 *  @private
	 */
	var OSES = [
	{
		string: navigator.platform,
		subString: "Win",
		identity: "WindowsPC"
	},
	{
		string: navigator.platform,
		subString: "Mac",
		identity: "Mac"
	},
	{
		string: navigator.userAgent,
		subString: "iPhone",
		identity: "iPhone/iPod"
	},
	{
		string: navigator.userAgent,
		subString: "iPad",
		identity: "iPad"
	},
	{
		string: navigator.userAgent,
		subString: "Android",
		identity: "Android"
	},
	{
		string: navigator.platform,
		subString: "Linux",
		identity: "LinuxPC"
	},
	{
		string: navigator.userAgent,
		subString: "apple-phone-audio-bug",
		identity: "iPhone/iPod"
	},
	{
		string: navigator.userAgent,
		subString: "apple-tablet-audio-bug",
		identity: "iPad"
	}];

	// assign to namespace
	namespace('springroll.pbskids').Platform = Platform;

}());
/**
 * @module Container
 * @namespace springroll.pbskids
 */
/* jshint ignore:start */
(function()
{
	/** 
	 * UUID.js: The RFC-compliant UUID generator for JavaScript.
	 * @class UUID 
	 */
	var UUID = function() {};

	/**
	 * The simplest function to get an UUID string.
	 * @method generate
	 * @static
	 * @returns {string} A version 4 UUID string.
	 */
	UUID.generate = function()
	{
		var rand = UUID._getRandomInt,
			hex = UUID._hexAligner;
		return hex(rand(32), 8) // time_low
			+
			"-" + hex(rand(16), 4) // time_mid
			+
			"-" + hex(0x4000 | rand(12), 4) // time_hi_and_version
			+
			"-" + hex(0x8000 | rand(14), 4) // clock_seq_hi_and_reserved clock_seq_low
			+
			"-" + hex(rand(48), 12); // node
	};

	/**
	 * Returns an unsigned x-bit random integer.
	 * @method _getRandomInt
	 * @static
	 * @private
	 * @param {int} x A positive integer ranging from 0 to 53, inclusive.
	 * @returns {int} An unsigned x-bit random integer (0 <= f(x) < 2^x).
	 */
	UUID._getRandomInt = function(x)
	{
		if (x < 0) return NaN;
		if (x <= 30) return (0 | Math.random() * (1 << x));
		if (x <= 53) return (0 | Math.random() * (1 << 30)) + (0 | Math.random() * (1 << x - 30)) * (1 << 30);
		return NaN;
	};

	/**
	 * Returns a function that converts an integer to a zero-filled string.
	 * @method _getIntAligner
	 * @static
	 * @private
	 * @param {int} radix
	 * @returns {function(num&#44; length)}
	 */
	UUID._getIntAligner = function(radix)
	{
		return function(num, length)
		{
			var str = num.toString(radix),
				i = length - str.length,
				z = "0";
			for (; i > 0; i >>>= 1, z += z)
			{
				if (i & 1)
				{
					str = z + str;
				}
			}
			return str;
		};
	};

	UUID._hexAligner = UUID._getIntAligner(16);

	/**
	 * Names of each UUID field.
	 * @type string[]
	 * @constant
	 * @since 3.0
	 */
	UUID.FIELD_NAMES = ["timeLow", "timeMid", "timeHiAndVersion",
		"clockSeqHiAndReserved", "clockSeqLow", "node"
	];

	/**
	 * Sizes of each UUID field.
	 * @property int[] FIELD_SIZES
	 * @constant
	 * @since 3.0
	 */
	UUID.FIELD_SIZES = [32, 16, 16, 8, 8, 48];

	/**
	 * Generates a version 4 {@link UUID}.
	 * @method getV4
	 * @static
	 * @returns {UUID} A version 4 {@link UUID} object.
	 * @since 3.0
	 */
	UUID.genV4 = function()
	{
		var rand = UUID._getRandomInt;
		return new UUID()._init(rand(32), rand(16), // time_low time_mid
			0x4000 | rand(12), // time_hi_and_version
			0x80 | rand(6), // clock_seq_hi_and_reserved
			rand(8), rand(48)); // clock_seq_low node
	};

	/**
	 * Converts hexadecimal UUID string to an {@link UUID} object.
	 * @method parse
	 * @static
	 * @param {string} strId UUID hexadecimal string representation ("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx").
	 * @returns {UUID} {@link UUID} object or null.
	 * @since 3.0
	 */
	UUID.parse = function(strId)
	{
		var r, p = /^\s*(urn:uuid:|\{)?([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{2})([0-9a-f]{2})-([0-9a-f]{12})(\})?\s*$/i;
		if (r = p.exec(strId))
		{
			var l = r[1] || "",
				t = r[8] || "";
			if (((l + t) === "") ||
				(l === "{" && t === "}") ||
				(l.toLowerCase() === "urn:uuid:" && t === ""))
			{
				return new UUID()._init(parseInt(r[2], 16), parseInt(r[3], 16),
					parseInt(r[4], 16), parseInt(r[5], 16),
					parseInt(r[6], 16), parseInt(r[7], 16));
			}
		}
		return null;
	};

	/**
	 * Initializes {@link UUID} object.
	 * @method _init
	 * @private
	 * @param {uint32} [timeLow=0] time_low field (octet 0-3).
	 * @param {uint16} [timeMid=0] time_mid field (octet 4-5).
	 * @param {uint16} [timeHiAndVersion=0] time_hi_and_version field (octet 6-7).
	 * @param {uint8} [clockSeqHiAndReserved=0] clock_seq_hi_and_reserved field (octet 8).
	 * @param {uint8} [clockSeqLow=0] clock_seq_low field (octet 9).
	 * @param {uint48} [node=0] node field (octet 10-15).
	 * @returns {UUID} this.
	 */
	UUID.prototype._init = function()
	{
		var names = UUID.FIELD_NAMES,
			sizes = UUID.FIELD_SIZES;
		var bin = UUID._binAligner,
			hex = UUID._hexAligner;

		/**
		 * List of UUID field values (as integer values).
		 * @type int[]
		 */
		this.intFields = new Array(6);

		/**
		 * List of UUID field values (as binary bit string values).
		 * @type string[]
		 */
		this.bitFields = new Array(6);

		/**
		 * List of UUID field values (as hexadecimal string values).
		 * @type string[]
		 */
		this.hexFields = new Array(6);

		for (var i = 0; i < 6; i++)
		{
			var intValue = parseInt(arguments[i] || 0);
			this.intFields[i] = this.intFields[names[i]] = intValue;
			this.bitFields[i] = this.bitFields[names[i]] = bin(intValue, sizes[i]);
			this.hexFields[i] = this.hexFields[names[i]] = hex(intValue, sizes[i] / 4);
		}

		/**
		 * UUID version number defined in RFC 4122.
		 * @type int
		 */
		this.version = (this.intFields.timeHiAndVersion >> 12) & 0xF;

		/**
		 * 128-bit binary bit string representation.
		 * @type string
		 */
		this.bitString = this.bitFields.join("");

		/**
		 * UUID hexadecimal string representation ("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx").
		 * @type string
		 */
		this.hexString = this.hexFields[0] + "-" + this.hexFields[1] + "-" + this.hexFields[2] + "-" + this.hexFields[3] + this.hexFields[4] + "-" + this.hexFields[5];

		/**
		 * UUID string representation as a URN ("urn:uuid:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx").
		 * @type string
		 */
		this.urn = "urn:uuid:" + this.hexString;

		return this;
	};

	UUID._binAligner = UUID._getIntAligner(2);

	/**
	 * Returns UUID string representation.
	 * @method toString
	 * @returns {string} {@link UUID#hexString}.
	 */
	UUID.prototype.toString = function()
	{
		return this.hexString;
	};

	/**
	 * Tests if two {@link UUID} objects are equal.
	 * @method equals
	 * @param {UUID} uuid
	 * @returns {bool} True if two {@link UUID} objects are equal.
	 */
	UUID.prototype.equals = function(uuid)
	{
		if (!(uuid instanceof UUID))
		{
			return false;
		}
		for (var i = 0; i < 6; i++)
		{
			if (this.intFields[i] !== uuid.intFields[i])
			{
				return false;
			}
		}
		return true;
	};

	/**
	 * Generates a version 1 {@link UUID}.
	 * @method genV1
	 * @static
	 * @returns {UUID} A version 1 {@link UUID} object.
	 * @since 3.0
	 */
	UUID.genV1 = function()
	{
		var now = new Date().getTime(),
			st = UUID._state;
		if (now != st.timestamp)
		{
			if (now < st.timestamp)
			{
				st.sequence++;
			}
			st.timestamp = now;
			st.tick = UUID._getRandomInt(4);
		}
		else if (Math.random() < UUID._tsRatio && st.tick < 9984)
		{
			// advance the timestamp fraction at a probability
			// to compensate for the low timestamp resolution
			st.tick += 1 + UUID._getRandomInt(4);
		}
		else
		{
			st.sequence++;
		}

		// format time fields
		var tf = UUID._getTimeFieldValues(st.timestamp);
		var tl = tf.low + st.tick;
		var thav = (tf.hi & 0xFFF) | 0x1000; // set version '0001'

		// format clock sequence
		st.sequence &= 0x3FFF;
		var cshar = (st.sequence >>> 8) | 0x80; // set variant '10'
		var csl = st.sequence & 0xFF;

		return new UUID()._init(tl, tf.mid, thav, cshar, csl, st.node);
	};

	/**
	 * Re-initializes version 1 UUID state.
	 * @method resetState
	 * @static
	 * @since 3.0
	 */
	UUID.resetState = function()
	{
		UUID._state = new UUID._state.constructor();
	};

	/**
	 * Probability to advance the timestamp fraction: the ratio of tick movements to sequence increments.
	 * @property {Number} _tsRadio
	 * @static
	 * @private
	 */
	UUID._tsRatio = 1 / 4;

	/**
	 * Persistent state for UUID version 1.
	 * @property {UUIDState} _state
	 * @static
	 * @private
	 */
	UUID._state = new function UUIDState()
	{
		var rand = UUID._getRandomInt;
		this.timestamp = 0;
		this.sequence = rand(14);
		this.node = (rand(8) | 1) * 0x10000000000 + rand(40); // set multicast bit '1'
		this.tick = rand(4); // timestamp fraction smaller than a millisecond
	};

	/**
	 * Get the time from field values
	 * @method _getTimeFieldValues
	 * @private
	 * @param {Date|int} time ECMAScript Date Object or milliseconds from 1970-01-01.
	 * @returns {object}
	 */
	UUID._getTimeFieldValues = function(time)
	{
		var ts = time - Date.UTC(1582, 9, 15);
		var hm = ((ts / 0x100000000) * 10000) & 0xFFFFFFF;
		return {
			low: ((ts & 0xFFFFFFF) * 10000) % 0x100000000,
			mid: hm & 0xFFFF,
			hi: hm >>> 16,
			timestamp: ts
		};
	};

	/**
	 * Reinstalls {@link UUID.generate} method to emulate the interface of UUID.js version 2.x.
	 * @method makeBackwardCompatible
	 * @static
	 * @since 3.1
	 * @deprecated Version 2.x. compatible interface is not recommended.
	 */
	UUID.makeBackwardCompatible = function()
	{
		var f = UUID.generate;
		UUID.generate = function(o)
		{
			return (o && o.version == 1) ? UUID.genV1().hexString : f.call(UUID);
		};
		UUID.makeBackwardCompatible = function() {};
	};

	// Assign to namespace
	namespace('springroll.pbskids').UUID = UUID;

})();
/* jshint ignore:end */
(function()
{
	/**
	 * Remote loggging of events
	 * @class LoggingService
	 * @constructor
	 * @param {string} [remoteHost] The hostname or IP Address of the machine
	 *        to log out the event data through WebSocket connection.
	 * @param {string} [remotePort=1025] The port for remote logging using
	 *        a WebSocket connection.
	 * @param {String} [channel] The name of the channel to start session.
	 */
	var LoggingService = function(remoteHost, remotePort, channel)
	{
		/**
		 * The Web socket connection for remote logging
		 * @property {WebSocket|MozWebSocket} socket
		 * @private
		 */
		this.socket = null;

		/**
		 * If the web socket connection is available for sending
		 * @property {boolean} connected
		 * @private
		 */
		this.connected = false;

		/**
		 * If the web socket connection is trying to connect
		 * @property {boolean} connecting
		 * @private
		 */
		this.connecting = false;

		/**
		 * The collection of events to buffer while connecting
		 * @property {array} socketBuffer
		 * @private
		 */
		this.socketBuffer = [];

		/**
		 * The current channel for remote logging
		 * @property {string} _channel
		 * @private
		 */
		this._channel = null;

		// Connect to the remote host if it's specified
		if (remoteHost)
		{
			this.connect(remoteHost, remotePort);

			// Set the channel
			if (channel)
			{
				this.channel = channel;
			}
		}
	};

	var p = LoggingService.prototype;

	/**
	 * Connect to the remote logging app
	 * @method connect
	 * @param {string} host Either the IP address or host
	 * @param {int} [port=1025] The port to use for remote logging.
	 */
	p.connect = function(host, port)
	{
		// Make sure WebSocket exists without prefixes for us
		if (("WebSocket" in window || "MozWebSocket" in window) && host)
		{
			port = port || 1025;

			window.WebSocket = WebSocket || MozWebSocket;

			// Bind handlers
			var onCloseRemote = this._onCloseRemote.bind(this);
			var onOpenRemote = this._onOpenRemote.bind(this);

			// Close the current connection if there is one
			onCloseRemote();

			// Start the connection
			this.connecting = true;

			try
			{
				var s = this.socket = new WebSocket("ws://" + host + ":" + port);
				s.onopen = onOpenRemote;
				s.onclose = onCloseRemote;
				s.onerror = onCloseRemote;
				return true;
			}
			catch (error)
			{
				onCloseRemote();
				if (true) console.error("Unable to connect to WebSocket");
				return false;
			}
		}
		return false;
	};

	/**
	 * The remote logging connection has been created
	 * @method onOpenRemote
	 * @private
	 */
	p._onOpenRemote = function()
	{
		this.connecting = false;
		this.connected = true;

		// Flush all buffered events once we're connected
		for (var i = 0; i < this.socketBuffer.length; i++)
		{
			this.socket.send(this.socketBuffer[i]);
		}

		// Clear the buffer
		this.socketBuffer.length = 0;
	};

	/**
	 * Callback for when the websocket is closed
	 * @method onCloseRemote
	 * @private
	 */
	p._onCloseRemote = function()
	{
		this.connecting = this.connected = false;

		if (this.socketBuffer)
		{
			this.socketBuffer.length = 0;
		}

		if (this.socket)
		{
			this.socket.close();
			this.socket.onopen = null;
			this.socket.onmessage = null;
			this.socket.onclose = null;
			this.socket.onerror = null;
			this.socket = null;
		}
	};

	/**
	 * Set the current channel
	 * @property {String} channel
	 */
	Object.defineProperty(p, 'channel',
	{
		set: function(channel)
		{
			this._channel = channel;
			this.send('session');
		},
		get: function()
		{
			return this._channel;
		}
	});

	/**
	 *  Send data to the remote logging application
	 *  @method send
	 *  @param {string} type Either "event" or "session"
	 *  @param {object} data The data object to send
	 */
	p.send = function(type, data)
	{
		var event = {
			type: type,
			channel: this._channel
		};

		if (!!data)
		{
			event.data = data;
		}

		// Convert to string to send
		event = JSON.stringify(event);

		if (this.connecting)
		{
			this.socketBuffer.push(event);
		}
		else if (this.connected)
		{
			this.socket.send(event);
		}
	};

	/**
	 * Don't use after this
	 * @method destroy
	 */
	p.destroy = function()
	{
		this._onCloseRemote();
		this.socketBuffer = null;
	};

	namespace('springroll.pbskids').LoggingService = LoggingService;

}());
/**
 * @module Container
 * @namespace springroll
 */
(function()
{
	/**
	 * @class Container
	 */
	var plugin = new springroll.ContainerPlugin(20);

	plugin.setup = function()
	{
		// Include classes
		var LoggingService = include('springroll.pbskids.LoggingService');

		/**
		 * The Progress tracker client for sending events 
		 * @property {springroll.pbskids.LoggingService} loggingService
		 */
		this.loggingService = new LoggingService(
			this.options.loggingHost,
			this.options.loggingPort,
			this.options.loggingChannel
		);
	};

	plugin.teardown = function()
	{
		this.loggingService.destroy();
		delete this.loggingService;
	};

}());
/**
 * @module Container
 * @namespace springroll
 */
(function()
{
	// Include classes
	var Minigame = include('springroll.pbskids.kartkingdom.Minigame', false);
	var MinigameEvent = include('springroll.pbskids.kartkingdom.MinigameEvent', false);

	/**
	 * @class Container
	 */
	var plugin = new springroll.ContainerPlugin();

	plugin.setup = function()
	{
		/**
		 * The instance of the Kart Kingdom Minigame API
		 * @property {Minigame} minigame
		 */
		this.minigame = null;
	};

	plugin.open = function()
	{
		this.client.on('kk-init', onKartKingdomInit.bind(this));
	};

	/**
	 * Initialize the Kart Kingdom API
	 * @method onKarKingdomInit
	 * @private
	 * @param {object} event Bellhop event
	 */
	var onKartKingdomInit = function(event)
	{
		// If we don't have the library, ignore
		if (!Minigame)
		{
			// Doesn't break/hang games which don't have
			// the Kart Kingdom API embedded with the container
			this.client.send('kk-init-done');
			return;
		}

		var config = event.data;

		if (true)
		{
			console.log("KartKingdomClient: container = ", this);
		}

		if (!this.dom.parentNode.id)
			this.dom.parentNode.id = this.dom.parentNode.id + "-kartkingdom-wrapper";

		this.minigame = new Minigame(
			config.gameID,
			this.dom.parentNode.id,
			function()
			{
				this.paused = true;
			},
			function()
			{
				this.paused = false;
			},
			config.options
		);

		onInitMinigame.call(this);

		// Let the client know we're done
		this.client.send('kk-init-done');
	};

	/**
	 * Bind handlers to events between the client and minigame instances.
	 * @method _addEventListeners
	 * @param {Minigame} minigame Instance of the Minigame API.
	 * @param {Bellhop} client Bellhop instance on the container.
	 * @private
	 */
	var onInitMinigame = function()
	{
		var client = this.client;
		var minigame = this.minigame;

		// Event Listeners on the Client
		client.on('kk-event', function(event)
		{
			minigame.event(event.data);
		});

		client.on('kk-level-complete', function(event)
		{
			minigame.levelComplete();
		});

		client.on('kk-destroy', function(event)
		{
			plugin.teardown.call(this);
		}.bind(this));

		client.respond('kk-has-power-up', minigame.hasPowerUp(event.data));

		client.on('kk-use-power-ups', function(event)
		{
			minigame.usePowerUps(
				event.data.powerupsObject,
				function()
				{
					//onSuccessCallback
					client.send(event.data.successEvent);
				},
				function()
				{
					//onFailureCallback
					client.send(event.data.failureEvent);
				}
			);
		});

		// Event Listeners on the Minigame API
		minigame.addEventListener(MinigameEvent.MINIGAME_READY, function(event)
		{
			client.send('kk-ready', event);
		});

		minigame.addEventListener(MinigameEvent.LEVEL_COMPLETE_OPEN, function(event)
		{
			client.send('kk-level-open', event);
		});

		minigame.addEventListener(MinigameEvent.LEVEL_COMPLETE_CLOSED, function(event)
		{
			client.send('kk-level-closed', event);
		});

		minigame.addEventListener(MinigameEvent.LEVEL_RESET, function(event)
		{
			client.send('kk-level-reset', event);
		});

		minigame.addEventListener(MinigameEvent.RESOURCES_EARNED, function(event)
		{
			client.send('kk-resources-earned', event);
		});

		minigame.addEventListener(MinigameEvent.RESOURCE_REQUEST_COMPLETE, function(event)
		{
			client.send('kk-resources-complete', event);
		});
	};

	plugin.teardown = function()
	{
		if (this.minigame)
		{
			this.minigame.destroy();
			delete this.minigame;
		}
	};

}());
/**
 * @module Container
 * @namespace springroll
 */
(function()
{
	/**
	 * @class Container
	 */
	var plugin = new springroll.ContainerPlugin();

	plugin.open = function()
	{
		var gaHandler = onGoogleAnalyticEvent.bind(this);

		// Client is setup, listen for learning event
		this.client.on(
		{
			analyticEvent: gaHandler,
			trackEvent: gaHandler // @deprecated
		});
	};

	plugin.close = function()
	{
		this.client.off('analyticEvent');
		this.client.off('trackEvent');
	};

	/**
	 * Track an event for Google Analtyics
	 * @method onGoogleAnalyticEvent
	 * @private
	 * @param {event} event Bellhop analyticEvent
	 */
	var onGoogleAnalyticEvent = function(event)
	{
		var data = event.data;

		// Send to the logging service
		this.loggingService.send('ga-event', data);

		// Producer site implementation of sending events
		var GoogleAnalytics = include("GA_obj", false);
		if (GoogleAnalytics && this.isProduction)
		{
			GoogleAnalytics.trackEvent(
				data.category,
				data.action,
				data.label,
				data.value
			);
		}

		/**
		 * Event when dispatching a Google Analytics event
		 * @event analyticEvent
		 * @param {object} data The event data
		 * @param {string} data.category The event category
		 * @param {string} data.action The event action
		 * @param {string} [data.label] The optional label
		 * @param {number} [data.value] The optional value
		 */
		this.trigger('analyticEvent', data);
	};

}());
/**
 * @module Container
 * @namespace springroll
 */
(function()
{
	var $ = include('PBS.KIDS.$_auth', false);

	// Fallback to using the non PBSKIDS jQuery
	if (!$) $ = include('jQuery');

	// Event name to check when the handband is ready
	var HEADBAND_READY = "org_pbskids_parentsbar_HeadbandEvent_HeadbandReady";

	/**
	 * @class Container
	 */
	// Must have a higher priority than the AnalyticsPlugin
	var plugin = new springroll.ContainerPlugin(10);

	plugin.setup = function()
	{
		/**
		 * If we're running in production mode, this is automatically set
		 * by calling `open()`, otherwise for `openRemote()` or `openPath()`
		 * it should be handled manually.
		 * @property {Boolean} isProduction
		 * @default false
		 */
		this.isProduction = false;

		/**
		 * The place where to load games from
		 * @property {String} apiDomain
		 * @default 'http://springroll.pbskids.org'
		 */
		this.apiDomain = this.options.apiDomain || 'http://springroll.pbskids.org';

		/**
		 * If we're currently on a producer site
		 * @property {Boolean} hasHeadband
		 * @readOnly
		 */
		this.hasHeadband = !!document.getElementById('headband-container');

		/**
		 * If the headband is ready/loaded
		 * @property {Boolean} headbandReady
		 * @readOnly
		 */
		var parentsBar = include('org.pbskids.parentsBar', false);
		this.headbandReady = !!(parentsBar && parentsBar.ready);

		/**
		 * Open application based on a slug or bundleId in SpringRoll Connect
		 * @method open
		 * @param {string} game The game's bundleId or slug property
		 * @param {Object} [options] The open options
		 * @param {Boolean} [options.singlePlay=false] If we should play in single play mode
		 * @param {Object} [options.playOptions=null] The optional play options
		 * @param {String} [options.query=''] The application query string options (e.g., "?level=1")
		 */
		/**
		 * Open application based on a slug or bundleId in SpringRoll Connect, the game
		 * sould be set via the data-game attribute on the iframe.
		 * @method open
		 * @param {Object} [options] The open options
		 * @param {Boolean} [options.singlePlay=false] If we should play in single play mode
		 * @param {Object} [options.playOptions=null] The optional play options
		 * @param {String} [options.query=''] The application query string options (e.g., "?level=1")
		 */
		this.open = function(game, options)
		{
			// We're on a producer site but the headband isn't fully loaded
			if (this.hasHeadband && !this.headbandReady)
			{
				// Wait for the loaded ready event
				$(document).one(HEADBAND_READY, function()
					{
						if (this._destroyed) return;

						// We're fully loaded
						this.headbandReady = true;

						// Re-open the game
						this.open(game, options);
					}
					.bind(this));
				return;
			}

			if (typeof game == "object")
			{
				options = game;
				game = null;
			}

			game = game || this.main.data('game');

			if (!game)
			{
				throw "No data-game attribute or game parameter";
			}

			var api = '/api/release/' + game;
			var env = include('springroll.env', false);
			var domainOverride = this.main.data('domain');
			var domain;

			// Open a game based on the environment file
			if (this.main.data('env'))
			{
				$.getJSON(this.main.data('env'), function(env)
					{
						if (this._destroyed) return;

						domain = domainOverride || env.domain || this.apiDomain;
						// Only enable analtyics if we're on live
						this.isProduction = env.status == "prod";
						this.openRemote(domain + api + envToQuery(env, this.main), options);
					}
					.bind(this));
			}
			// Open game based on global environment setting
			else if (env)
			{
				domain = domainOverride || env.domain || this.apiDomain;
				// Only enable analtyics if we're on live
				this.isProduction = env.status == "prod";
				this.openRemote(domain + api + envToQuery(env, this.main), options);
			}
			// Open the production version of the game
			else
			{
				domain = domainOverride || this.apiDomain;
				this.isProduction = true; // enable the tracking
				this.openRemote(domain + api + envToQuery(
				{}, this.main), options);
			}
		};
	};

	// cleanup
	plugin.teardown = function()
	{
		$(document).off(HEADBAND_READY);
		delete this.isProduction;
		delete this.apiDomain;
		delete this.headbandReady;
		delete this.hasHeadband;
		delete this.open;
	};

	/**
	 * Convert an environment object into an API query string
	 * @method envToQuery
	 * @private
	 * @param {Object} env The environment settings
	 * @return {String} The query string
	 */
	var envToQuery = function(env, main)
	{
		env = env ||
		{};

		var debug = !!main.data('debug') || env.debug;
		var status = main.data('status') || env.status;
		var token = main.data('token') || env.token;

		var query = [];

		if (token) query.push("token=" + token);
		if (status) query.push("status=" + status);
		if (debug) query.push("debug=1");

		return query.length ? "?" + query.join('&') : "";
	};

}());
/**
 * @module OpenId
 * @namespace springroll.pbskids.openid
 */
(function()
{
	var Bellhop = include('Bellhop');
	var Events;
	var FrameSizer;
	var EventDispatcher = include('springroll.EventDispatcher');
	var $ = include('jQuery');

	/**
	 * Represents an iframe in which an OpenID authorization will occur. Once the authentication completes, the page will
	 * then report back (via Bellhop) with a token
	 *
	 * @constructor
	 * @param {jQuery} $siblingFrame The game's iframe, so we can place it as a sibling
	 * @param {Object} options
	 * @param {Number} options.timeout The time (in millis) to wait for the frame to open. If not defined, no timeout will be used
	 * @param {Boolean} options.visible Whether or not the frame should be visible
	 * @param {String} options.provider_url The OpenId provider url to open
	 * @param {String} options.client_id The OpenId client id
	 * @param {String} options.redirect_uri The redirect uri after authentication is successful
	 * @param {String} otions.response_type The type of response the provider requires
	 * @param {Number} options.site_id The site id of the client to use for the OpenId provider
	 */
	var AuthorizationFrame = function($siblingFrame, options)
	{
		// deferred loading, since the events module may have not init-d yet.
		Events = include('springroll.pbskids.openid.Events');
		FrameSizer = include('springroll.pbskids.openid.FrameSizer');

		EventDispatcher.call(this);

		// provide defaults and then validate
		this.options = Object.merge(
		{
			visible: false,
		}, options);
		//this.validateOptions();

		this.frame = document.createElement('iframe');
		this.frameSizer = new FrameSizer(this.frame, $siblingFrame[0]);

		if (!options.visible)
		{
			this.frame.style.display = 'none';
			this.frame.style.visibility = 'hidden';
		}

		$siblingFrame.after(this.frame);
	};

	var frameProto = EventDispatcher.extend(AuthorizationFrame);

	/**
	 * Validates the options for the authorization frame, throwing an exception if any fields are missing
	 * @throws {Error} An error if there are any missing fields that are required
	 */
	frameProto.validateOptions = function()
	{
		// if any required keys are missing
		var requiredKeys = ['provider_url', 'client_id', 'redirect_uri', 'response_type', 'scope'];
		var missingKeys = requiredKeys.filter(function(key)
		{
			return this.options[key] === undefined;
		}.bind(this));

		if (missingKeys.length > 0)
		{
			throw 'Missing required keys ' + missingKeys.join(', ');
		}
	};

	/**
	 * Opens the authorization frame to the configured provider url, which will emit Events.openIdAuthSuccess or
	 * Events.openIdAuthFailure
	 */
	frameProto.open = function()
	{
		this.frame.src = buildFullFrameUrl(this.options);
		this.authorization_client = new Bellhop();
		this.authorization_client.connect(this.frame);
		this.authorization_client.on(Events.openIdAuthSuccess, this.onAuthorized.bind(this));
		this.authorization_client.on(Events.openIdAuthFailure, this.onAuthorizationFail.bind(this));

		if (this.options.timeout !== undefined)
		{
			this.timeout = setTimeout(this.onAuthorizationTimeout.bind(this), this.options.timeout);
		}
	};

	/**
	 * Closes this frame, by removing the internal iframe from the page altogether
	 */
	frameProto.close = function()
	{
		clearTimeout(this.timeout);
		this.authorization_client.off();
		this.frameSizer.close();
		this.frame.remove();
	};

	/**
	 * Builds a full url path to the authorization frame, by appending on all of the query parameters needed for the frame
	 * to redirect properly
	 * @private
	 * @param {Object} options
	 * @param {String} options.response_type The type of response the Open ID provider should use
	 * @param {String} options.scope The scope to use for the Open ID provider
	 * @param {String} options.provider_url The OpenId provider url to open
	 * @param {String} options.client_id The OpenId client id
	 * @param {String} options.redirect_uri The redirect uri after authentication is successful
	 * @param {Number} options.site_id The site id of the client to use for the OpenId provider
	 */
	var buildFullFrameUrl = function(options)
	{
		// build query parameters for only the fields that were provided
		var queryParams = {};
		var acceptedFields = ['response_type', 'scope', 'client_id', 'redirect_uri', 'site_id', 'nonce', 'id_token', 'access_token', 'api_key'];
		acceptedFields
			.filter(function(field)
			{
				return options[field] != undefined;
			})
			.forEach(function(field)
			{
				queryParams[field] = options[field];
			});

		return options.provider_url + '?' + $.param(queryParams);
	};

	/**
	 * Callback for when the authorization completes successfully
	 *
	 * @param {Object} event The raw bellhop event from the successful authorization page
	 */
	frameProto.onAuthorized = function(event)
	{
		this.close();
		this.trigger(Events.openIdAuthSuccess, event);
	};

	/**
	 * Callback for when the authorization fails for some reason
	 *
	 * @param {Object} event The raw bellhop event from the unsuccessful authorization
	 */
	frameProto.onAuthorizationFail = function(event)
	{
		this.close();
		this.trigger(Events.openIdAuthFailure, event);
	};

	/**
	 * Callback if the frame never responds after a given amount of time
	 */
	frameProto.onAuthorizationTimeout = function()
	{
		this.onAuthorizationFail(
		{
			data:
			{
				reason: 'timeout'
			}
		});
	};

	namespace('springroll.pbskids.openid').AuthorizationFrame = AuthorizationFrame;
})();
(function()
{
	// Here, we're building the event names as an object with key/values that are the same. I'm doing it this way because
	// I don't want to have to include springroll.Enum just for this one class
	var eventNames = [
		"requestOpenIdAuth",
		"openIdAuthSuccess",
		"openIdAuthFailure",
		"openIdProviderFailure",
		"openIdAuthFinished"
	];

	var Events = {};

	eventNames.forEach(function(name)
	{
		Events[name] = name;
	});

	/**
	 * The types of OpenId events we might trigger
	 * @enum {String}
	 */
	namespace('springroll.pbskids.openid').Events = Events;
})();
(function()
{
	/**
	 * A helper class for monitoring the screen and resizing a frame to always overlap another. In our case, some
	 * authentication view needs to obscure the game
	 *
	 * @constructor
	 * @param {Node} frame The frame to size
	 * @param {Node} frameToMatch The frame that we should match in size at all times
	 */
	var FrameSizer = function(frame, frameToMatch)
	{
		this.frame = frame;
		this.frameToMatch = frameToMatch;

		// create a copy of the the prototype resize method, but save it so that when we close the frame we can properly
		// unbind the event
		this.resizeFrame = this.resizeFrame.bind(this);
		window.addEventListener('resize', this.resizeFrame);
		this.resizeFrame();
	};

	/**
	 * Resizes the frame to match the current size of the frame to match
	 */
	FrameSizer.prototype.resizeFrame = function()
	{
		var boundingRect = this.frameToMatch.getBoundingClientRect();

		// apply initial styling
		this.frame.style.position = 'absolute';

		this.frame.style.top = boundingRect.top;
		this.frame.style.left = boundingRect.left;
		this.frame.style.width = boundingRect.width;
		this.frame.style.height = boundingRect.height;
	};

	/**
	 * Unhooks the global resize listener, effectively disabling the auto-resize mechanics. Note that you can still
	 * manually resize here, using `resizeFrame` whenever you need
	 */
	FrameSizer.prototype.close = function()
	{
		window.removeEventListener('resize', this.resizeFrame);
	};

	namespace('springroll.pbskids.openid').FrameSizer = FrameSizer;
})();
(function()
{
	// the alphabet we'll use for generating random characters
	var alphabet = 'abcdefghijklmnopqrstuvwxyz' +
		'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
		'1234567890_-';

	/**
	 * Generates a random character for a nonce
	 * @private
	 * @return {String}
	 */
	var randomCharacter = function()
	{
		// use the crypto API to generate a single random byte
		var buffer = new Uint8Array(1);
		if (window.crypto)
		{
			window.crypto.getRandomValues(buffer);
		}
		else if (window.msCrypto)
		{
			window.msCrypto.getRandomValues(buffer);
		}
		else
		{
			buffer[0] = Math.floor(Math.random() * 256);
		}
		var singleByte = buffer[0];

		var index = Math.floor(singleByte / 256.0 * alphabet.length);
		return alphabet[index];
	};

	/**
	 * Module for creating cryptographic nonces
	 */
	namespace('springroll.pbskids.openid').NonceFactory = {
		/**
		 * Creates a new nonce with the specified length
		 *
		 * @param {Number} length The length of the nonce
		 * @return {String}
		 */
		make: function(length)
		{
			if (length === undefined)
			{
				length = 10;
			}

			var nonce = '';
			for (var i = 0; i < length; i++)
			{
				nonce += randomCharacter();
			}

			return nonce;
		}
	};
})();
/**
 * This Container plugin provides OpenId authentication services to games. Games can notify the container that they'd
 * like to authenticate, and if the app is configured with an `open_id` configuration, this plugin will attempt to
 * authorize against an OpenId provider.In particular, it'll use the `client_id`, `provider_url`, `redirect_uri`, and
 * `site_id` fields
 * @module OpenId
 * @namespace springroll.pbskids.openid
 */
(function()
{
	var Events;
	var AuthorizationFrame;
	var NonceFactory;

	var plugin = new springroll.ContainerPlugin();

	/**
	 * A reference to the container's game iframe as a jQuery object
	 *
	 * @var {jQuery} gameFrame
	 */
	plugin.gameFrame = null;

	/**
	 * A reference to the Container's `client` Bellhop container. This prevents us from needing to hold onto the
	 * container throughout the lifetime of the authentication process. Instead, we can simply send messages to the game
	 * via plugin.game.send(event, data);
	 *
	 * @var {Bellhop} gameClient
	 */
	plugin.gameClient = null;

	/**
	 * Open method for the plugin. Waits for the game to request open id auth. If the game needs it, it will then begin
	 * the chain of steps to authorize properly. NOTE: We're using open, rather than setup here because the Bellhop client
	 * is not ready until the open event
	 */
	plugin.open = function()
	{
		// require libraries
		Events = include('springroll.pbskids.openid.Events');
		AuthorizationFrame = include('springroll.pbskids.openid.AuthorizationFrame');
		NonceFactory = include('springroll.pbskids.openid.NonceFactory');

		plugin.gameFrame = this.main;
		plugin.gameClient = this.client;

		plugin.gameClient.on(Events.requestOpenIdAuth, plugin.onOpenIdRequested);
	};

	/**
	 * Callback for when a request for authorization is received. Will attempt to authorize with the configured OpenId
	 * provider (if one was provided in the Container's configuration).
	 *
	 * @param {Object} event The raw Bellhop event from the game
	 */
	plugin.onOpenIdRequested = function(event)
	{
		plugin.config = Object.merge(
		{
			'nonce': NonceFactory.make(),
			'visible': true
		}, event.data);

		// Do the first authentication with the main provider
		try
		{
			var frame = new AuthorizationFrame(plugin.gameFrame, plugin.config);
			frame.on(Events.openIdAuthSuccess, plugin.onProviderAuthenticated);
			frame.on(Events.openIdAuthFailure, plugin.onProviderAuthenticationFail);
			frame.open();
		}
		catch (e)
		{
			plugin.gameClient.send(Events.openIdAuthFailure,
			{
				reason: e.toString()
			});
		}
	};

	/**
	 * Callback for when the provider successfully authenticates. From here we'll begin authenticating with any clients
	 * through the provider as well
	 *
	 * @param {Object} event The raw bellhop event from the provider
	 */
	plugin.onProviderAuthenticated = function(event)
	{
		plugin.providerAuthResults = event.data;

		// now that we've authenticated with the main Open Id provider, let's authenticate with the list of clients provided
		// as configuration to this plugin
		plugin.config.clients.map(plugin.attemptClientAuth);
	};

	/**
	 * Attempts to authenticate a single client
	 *
	 * @param {Object} client The configuration for the single client
	 */
	plugin.attemptClientAuth = function(client)
	{
		// create the frame configuration, containing the basic open id info from the client and the newly received
		// tokens from the open id provider auth
		var configuration = {
			provider_url: plugin.config.provider_url,
			client_id: plugin.config.client_id,
			nonce: NonceFactory.make(),
			timeout: 5000
		};
		Object.merge(configuration, client);

		// create a new iframe for authenticating the client
		try
		{
			var frame = new AuthorizationFrame(plugin.gameFrame, configuration);
			frame.on(Events.openIdAuthSuccess, function(event)
			{
				plugin.onClientFinish(client, event, true);
			});

			frame.on(Events.openIdAuthFailure, function(event)
			{
				plugin.onClientFinish(client, event, false);
			});

			frame.open();
		}
		catch (e)
		{
			plugin.onClientFinish(client,
			{
				data:
				{
					reason: e.toString()
				}
			}, false);
		}
	};

	/**
	 * Handler for when the provider fails authentication. If the provider fails to authenticate then no clients will be
	 * able to authenticate, and so the authentication workflow stops here.
	 *
	 * @param {Object} event A raw bellhop event from the provider
	 */
	plugin.onProviderAuthenticationFail = function(event)
	{
		plugin.gameClient.send(Events.openIdProviderFailure, event.data);
	};

	/**
	 * Handler for when a client successfully (or unsuccessfully) authenticates. Notifies the game of the single event,
	 * and the pushes it to the global list of authentication results. If all clients have finished up, this will also
	 * notify the game of the entire authentication results as well.
	 *
	 * @param {Object} client The client configuration for this particular client
	 * @param {Object} event The raw event that was emitted from the authentication frame
	 * @param {Boolean} didSucceed A boolean representing if the authentication did succeed or not
	 */
	plugin.onClientFinish = function(client, event, didSucceed)
	{
		var data = {
			name: client.name,
			success: didSucceed
		};
		Object.merge(data, event.data);

		// notify the single result of authentication
		var eventName = didSucceed ? Events.openIdAuthSuccess : Events.openIdAuthFailure;
		plugin.gameClient.send(eventName, data);

		plugin.clientAuthResults = plugin.clientAuthResults || [];
		plugin.clientAuthResults.push(data);

		if (plugin.clientAuthResults.length >= plugin.config.clients.length)
		{
			plugin.gameClient.send(Events.openIdAuthFinished,
			{
				provider: plugin.providerAuthResults,
				clients: plugin.clientAuthResults
			});
		}
	};

	namespace('springroll.pbskids.openid').OpenIdPlugin = plugin;
})();
(function()
{
	var pbskids = namespace('springroll.pbskids');
	Object.defineProperty(pbskids, 'Container',
	{
		get: function()
		{
			if (true && window.console)
				console.warn("springroll.pbskids.Container is deprecated, use springroll.Container instead");
			return include('springroll.Container');
		}
	});

}());
/**
 * The Producer implementable SpringRoll Container. Automatically
 * handle the game Google Analytics, Kart Kingdom and Learning Events.
 * @class Container
 * @constructor
 * @param {string} iframeSelector jQuery selector for application iframe container
 * @param {object} [options] Optional parameters
 * @param {String} [options.apiDomain='http://springroll.pbskids.org'] 
 *        The domain to load games from.
 * @param {string} [options.helpButton] jQuery selector for help button
 * @param {string} [options.captionsButton] jQuery selector for captions button
 * @param {string} [options.soundButton] jQuery selector for captions button
 * @param {string} [options.voButton] jQuery selector for vo button
 * @param {string} [options.sfxButton] jQuery selector for sounf effects button
 * @param {string} [options.musicButton] jQuery selector for music button
 * @param {string} [options.pauseButton] jQuery selector for pause button
 * @param {string} [options.pauseFocusSelector='.pause-on-focus'] The class to pause
 *        the application when focused on. This is useful for form elements which
 *        require focus and play better with Application's keepFocus option.
 * @param {string} [options.learningDomain='http://progresstracker.pbskids.org'] The domain for the end-point
 *        this should only be set for mobile devices or testing otherwise
 *        it uses a root-relative end-point and will use the /progresstracker
 *        on the current domain
 * @param {string} [options.learningResource='game'] The type of resource
 * @param {string} [options.loggingHost] The hostname or IP Address of the machine
 *        to log out the event data through WebSocket connection.
 * @param {string} [options.loggingPort=1025] The port for remote logging using
 *        a WebSocket connection.
 * @param {string} [options.loggingChannel] The name of the logging service channel
 *        this should be the slug of the event specification.
 */
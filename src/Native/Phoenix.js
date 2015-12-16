Elm.Native.Phoenix = {};
Elm.Native.Phoenix.make = function(localRuntime) {
	localRuntime.Native = localRuntime.Native || {};
	localRuntime.Native.Phoenix = localRuntime.Native.Phoenix || {};
	if (localRuntime.Native.Phoenix.values)
	{
		return localRuntime.Native.Phoenix.values;
	}

  var Task = Elm.Native.Task.make(localRuntime);
	var Signal = Elm.Native.Signal.make(localRuntime);
	var List = Elm.Native.List.make(localRuntime);
	var Utils = Elm.Native.Utils.make(localRuntime);

	// Socket

	function newSocket(options) {
		var opts = {};

		switch (options.transport.ctor) {
			case 'Auto':
			  break;
			case 'WebSocket':
				opts.transport = window.WebSocket;
			  break;
			case 'LongPoll':
				opts.transport = window.Phoenix.LongPoll;
			  break;
		}

		if (options.heartbeatIntervalMs.ctor == 'Just')
			opts.heartbeatIntervalMs = options.heartbeatIntervalMs._0;

		if (options.reconnectAfterMs.ctor != '[]') {
			var intervals = List.toArray(options.reconnectAfterMs);
			opts.reconnectAfterMs = function(tries) {
				var i = (tries >= intervals.length) ? intervals.length : tries
        return intervals[i-1];
      }
		}

		if (options.logger.ctor == 'Just') {
			switch (options.logger._0.ctor) {
				case 'Console':
					opts.logger = function(kind, message, data) {
						if (data)
							console.log(kind + ": " + message, data)
						else
							console.log(kind + ": " + message);
					};
				  break;
				case 'Mailbox':
					var sendLogMessage = options.logger._0._0._0;
					opts.logger = function(kind, message, data) {
						Task.perform(sendLogMessage({
							_: {},
							kind: kind.toString() || "",
							message: message.toString() || "",
							data: data ? {ctor: 'Just', _0: data} : {ctor: 'Nothing'}
						}));
					};
				  break;
			}
		}

		if (options.longpollerTimeout.ctor == 'Just')
			opts.longpollerTimeout = options.longpollerTimeout._0;

		if (options.params.ctor == 'Just')
			opts.params = options.params._0;

		var socket = new window.Phoenix.Socket(options.endPoint, opts);

		if (options.onStateChange.ctor == 'Just') {
			var statusChangeCallback = options.onStateChange._0;
			var reportStateChange = function(state) {
				var response = statusChangeCallback(state);
				switch (response.ctor) {
					case 'Ignore':
					  break;
					case 'Disconnect':
					  socket.disconnect();
						break;
					case 'SendMessage':
					  Signal.sendMessage(response._0);
					  break;
					case "PerformTask":
            Task.perform(response._0);
            break;
				}
			};
			socket.onOpen(function() {
				reportStateChange({ctor: 'Open'});
			});
			socket.onClose(function(event) {
				reportStateChange({ctor: 'Closed', _0: event});
			});
			socket.onError(function(error) {
				reportStateChange({ctor: 'Error', _0: error});
			});
		}

		return socket;
	}

	// Channel

	function newChannel(options) {
		var channel = (options.params.ctor == 'Just')
			? options.socket.channel(options.topic, options.params._0)
			: options.socket.channel(options.topic);

		var on = options.on;
		while (on.ctor !== '[]') {
			var hook = on._0;
			function handler(hook) {
				return function(msg) {
					var response = hook.callback(msg);
					switch (response.ctor) {
						case 'Ignore':
							break;
						case 'Leave':
							channel.leave();
							break;
						case 'SendMessage':
							Signal.sendMessage(response._0);
							break;
						case "PerformTask":
							Task.perform(response._0);
							break;
					}
				}
			}
			channel.on(hook.event, handler(hook));
			on = on._1;
    }
		return channel;
	};

  return localRuntime.Native.Phoenix.values = {
		connect: function(options) {
			return Task.asyncFunction(function(callback) {
				var socket = newSocket(options);
				socket.connect();
				callback(Task.succeed(socket));
			});
		},
		tryConnect: function(options) {
			return Task.asyncFunction(function(callback) {
				var socket = newSocket(options);
				var trying = true;
				socket.onOpen(function() {
					if (trying) {
						trying = false;
						callback(Task.succeed(socket));
					}
				});
				socket.onError(function(error) {
					if (trying) {
						trying = false;
						socket.disconnect();
						callback(Task.fail(error));
					}
				});
				socket.connect();
			});
		},
		updateParams: F2(function(params, socket) {
			return Task.asyncFunction(function(callback) {
				socket.params = params;
				callback(Task.succeed(Utils.Tuple0));
			});
		}),
		disconnect: function(socket) {
			return Task.asyncFunction(function(callback) {
				socket.disconnect();
				callback(Task.succeed(Utils.Tuple0));
			});
		},

		join: function(options) {
			return Task.asyncFunction(function(callback) {
				var channel = newChannel(options);
				var joinPush = channel.join();
				if (options.onStateChange.ctor == 'Just') {
					console.log("Activating onStateChange hooks");
					var statusChangeCallback = options.onStateChange._0;
					var reportStateChange = function(state) {
						var response = statusChangeCallback(state);
						switch (response.ctor) {
							case 'Ignore':
							  break;
							case 'Reply':
							  channel.push(response._0, response._1)
							  break;
							case 'Leave':
							  channel.leave();
								break;
							case 'SendMessage':
							  Signal.sendMessage(response._0);
							  break;
							case "PerformTask":
		            Task.perform(response._0);
		            break;
						}
					};
					channel.onClose(function() {
						reportStateChange({ctor: 'Left'});
					});
					channel.onError(function(reason) {
						reportStateChange({ctor: 'Error', _0: reason});
					});
					joinPush.receive("ok", function(msg) {
						reportStateChange({ctor: 'Joined', _0: msg});
					});
					joinPush.receive("error", function(reason) {
						reportStateChange({ctor: 'Rejected', _0: reason});
					});
				}
				callback(Task.succeed(channel));
			});
		},
		tryJoin: F2(function(timeout, options) {
			return Task.asyncFunction(function(callback) {
				var channel = newChannel(options);
				var joinPush = channel.join();
				var trying = true;
				var reportStateChange = function() {};
				if (options.onStateChange.ctor == 'Just') {
					var statusChangeCallback = options.onStateChange._0;
					reportStateChange = function(state) {
						var response = statusChangeCallback(state);
						switch (response.ctor) {
							case 'Ignore':
							  break;
							case 'Reply':
							  channel.push(response._0, response._1)
							  break;
							case 'Leave':
							  channel.leave();
								break;
							case 'SendMessage':
							  Signal.sendMessage(response._0);
							  break;
							case "PerformTask":
		            Task.perform(response._0);
		            break;
						}
					};
					channel.onClose(function() {
						reportStateChange({ctor: 'Left'});
					});
					channel.onError(function(reason) {
						reportStateChange({ctor: 'Error', _0: reason});
					});
				}
				joinPush.receive("ok", function(msg) {
					if (trying) {
						trying = false;
						callback(Task.succeed(Utils.Tuple2(channel, msg)));
					}
					reportStateChange({ctor: 'Joined', _0: msg});
				});
				joinPush.receive("error", function(reason) {
					if (trying) {
						trying = false;
						channel.leave();
						callback(Task.fail({ctor: 'ErrorReply', _0: reason}));
					}
					reportStateChange({ctor: 'Rejected', _0: reason});
				});
				joinPush.after(timeout, function() {
					if (trying) {
						trying = false;
						channel.leave();
						callback(Task.fail({ctor: 'Timeout'}));
					}
				});
			});
		}),
		push: F3(function(event, payload, channel) {
			return Task.asyncFunction(function(callback) {
				channel.push(event, payload);
				callback(Task.succeed(Utils.Tuple0));
			});
		}),
		tryPush: F4(function(event, payload, timeout, channel) {
			return Task.asyncFunction(function(callback) {
				channel.push(event, payload)
					.receive("ok", function(msg) { Task.succeed(msg) })
					.receive("error", function(reason) { Task.fail({ctor: 'ErrorReply', _0: reason}) })
					.after(timeout, function() { Task.fail({ctor: 'Timeout'}) })
			});
		}),
		updateChannelParams: F2(function(params, channel) {
			return Task.asyncFunction(function(callback) {
				channel.params = params;
				callback(Task.succeed(Utils.Tuple0));
			});
		}),
		leave: function(channel) {
			return Task.asyncFunction(function(callback) {
				channel.leave();
				callback(Task.succeed(Utils.Tuple0));
			});
		},

		socketToString: function(socket) {
			return "Phoenix.Socket< endpoint="
				+ socket.endPointURL()
				+ " >";
		},
		channelToString: function(channel) {
			return "Phoenix.Channel< topic="
				+ channel.topic
				+ " >";
		},
  };
};

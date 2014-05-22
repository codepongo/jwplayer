/**
 * This class is responsible for setting up the player and triggering the PLAYER_READY event, or an JWPLAYER_ERROR event
 * 
 * The order of the player setup is as follows:
 * 
 * 1. parse config
 * 2. load skin (async)
 * 3. load external playlist (async)
 * 4. load preview image (requires 3)
 * 5. initialize components (requires 2)
 * 6. initialize plugins (requires 5)
 * 7. ready
 *
 * @author pablo
 * @version 6.0
 */
(function(jwplayer) {
	var html5 = jwplayer.html5,
		utils = jwplayer.utils,
		events = jwplayer.events,
	
		PARSE_CONFIG = 1,
		LOAD_SKIN = 2,
		LOAD_PLAYLIST = 3,
		LOAD_PREVIEW = 4,
		SETUP_COMPONENTS = 5,
		INIT_PLUGINS = 6,
		SEND_READY = 7;


	html5.setup = function(model, view) {
		var _model = model,
			_view = view,
			_completed = {},
			_skin,
			_eventDispatcher = new events.eventdispatcher(),
			_errorState = false,
			_queue = [];

		// This is higher scope so it can be used in two functions to remove event listeners
		var _previewImg;

		function _initQueue() {
			_addTask(PARSE_CONFIG, _parseConfig);
			_addTask(LOAD_SKIN, _loadSkin, PARSE_CONFIG);
			_addTask(LOAD_PLAYLIST, _loadPlaylist, PARSE_CONFIG);
			_addTask(LOAD_PREVIEW, _loadPreview, LOAD_PLAYLIST);
			_addTask(SETUP_COMPONENTS, _setupComponents, LOAD_PREVIEW + "," + LOAD_SKIN);
			_addTask(INIT_PLUGINS, _initPlugins, SETUP_COMPONENTS + "," + LOAD_PLAYLIST);
			_addTask(SEND_READY, _sendReady, INIT_PLUGINS);
		}

		function _addTask(name, method, depends) {
			_queue.push({name:name, method:method, depends:depends});
		}

		function _nextTask() {
			for (var i=0; i < _queue.length; i++) {
				var task = _queue[i];
				if (_allComplete(task.depends)) {
					_queue.splice(i, 1);
					try {
						task.method();
						_nextTask();
					} catch(error) {
						_error(error.message);
					}
					return;
				}
			}
			if (_queue.length > 0 && !_errorState) {
				// Still waiting for a dependency to come through; wait a little while.
				setTimeout(_nextTask, 500);
			}
		}

		function _allComplete(dependencies) {
			if (!dependencies) return true;
			var split = dependencies.toString().split(",");
			for (var i=0; i<split.length; i++) {
				if (!_completed[split[i]])
					return false;
			}
			return true;
		}

		function _taskComplete(name) {
			_completed[name] = true;
		}

		function _parseConfig() {
			if (model.edition && model.edition() == "invalid") {
				_error("Error setting up player: Invalid license key");
			}
			else {
				_taskComplete(PARSE_CONFIG);
			}
		}

		function _loadSkin() {
			_skin = new html5.skin();
			_skin.load(_model.config.skin, _skinLoaded, _skinError);
		}

		function _skinLoaded() {
			_taskComplete(LOAD_SKIN);
		}

		function _skinError(message) {
			_error("Error loading skin: " + message);
		}

		function _loadPlaylist() {
			var type = utils.typeOf(_model.config.playlist);
			if (type === "array") {
				_completePlaylist(new jwplayer.playlist(_model.config.playlist));
			} else {
				_error("Playlist type not supported: "+ type);
			}
		}

		function _completePlaylist(playlist) {
			_model.setPlaylist(playlist);
			// TODO: support playlist index in config
			// _model.setItem(_model.config.item);
			if (_model.playlist.length === 0 || _model.playlist[0].sources.length === 0) {
				_error("Error loading playlist: No playable sources found");
			} else {
				_taskComplete(LOAD_PLAYLIST);
			}
		}

		var previewTimeout = -1;
		function _loadPreview() {
			var preview = _model.playlist[_model.item].image;
			if (preview) {
				_previewImg = new Image();
				_previewImg.addEventListener('load', _previewLoaded, false);
				// If there was an error, continue anyway
				_previewImg.addEventListener('error', _previewLoaded, false);
				_previewImg.src = preview;
				clearTimeout(previewTimeout);
				previewTimeout = setTimeout(_previewLoaded, 500);
			} else {
				_previewLoaded();
			}
		}

		function _previewLoaded() {
			if (_previewImg) {
				_previewImg.removeEventListener('load', _previewLoaded, false);
				_previewImg.removeEventListener('error', _previewLoaded, false);
			}

			clearTimeout(previewTimeout);
			_taskComplete(LOAD_PREVIEW);
		}

		function _setupComponents() {
			_view.setup(_skin);
			_taskComplete(SETUP_COMPONENTS);
		}

		function _initPlugins() {
			_taskComplete(INIT_PLUGINS);
		}

		function _sendReady() {
			_eventDispatcher.sendEvent(events.JWPLAYER_READY);
			_taskComplete(SEND_READY);
		}

		function _error(message) {
			_errorState = true;
			_eventDispatcher.sendEvent(events.JWPLAYER_ERROR, {message: message});
			_view.setupError(message);
		}

		utils.extend(this, _eventDispatcher);
		
		this.start = _nextTask;

		_initQueue();
	};

})(jwplayer);


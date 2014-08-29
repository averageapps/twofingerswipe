// This addon is heavily based on Three Finger Swipe:
// https://addons.mozilla.org/en-US/android/addon/three-finger-swipe/
// All credit belongs to its original developer, Gomita:
// https://addons.mozilla.org/en-US/android/user/gomita/

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");

function install(data, reason) {
	TwoFingerSwipe.install();
}

function uninstall(data, reason) {
	if (reason == ADDON_UNINSTALL)
		TwoFingerSwipe.uninstall();
}

function startup(data, reason) {
	var winEnum = Services.wm.getEnumerator("navigator:browser");
	while (winEnum.hasMoreElements()) {
		var win = winEnum.getNext().QueryInterface(Ci.nsIDOMWindow);
		TwoFingerSwipe.init(win);
	}
	Services.wm.addListener(windowListener);
}

function shutdown(data, reason) {
	if (reason == APP_SHUTDOWN)
		return;
	Services.wm.removeListener(windowListener);
	var winEnum = Services.wm.getEnumerator("navigator:browser");
	while (winEnum.hasMoreElements()) {
		var win = winEnum.getNext().QueryInterface(Ci.nsIDOMWindow);
		TwoFingerSwipe.uninit(win);
	}
}

var windowListener = {
	onOpenWindow: function(aWindow) {
		var win = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).
		                  getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
		win.addEventListener("UIReady", function(event) {
			win.removeEventListener("UIReady", arguments.callee, false);
			TwoFingerSwipe.init(win);
		}, false);
	},
	onCloseWindow: function(aWindow) {
		var win = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).
		                  getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
		TwoFingerSwipe.uninit(win);
	},
	onWindowTitleChange: function(aWindow) {},
};

function log(aMessage) {
	Services.console.logStringMessage("twofingerswipe: " + aMessage);
}

function alert(aMessage) {
	Services.prompt.alert(null, "twofingerswipe", aMessage);
}

var TwoFingerSwipe = {

	fingers: 2,

	threshold: 50,

	_window: null,

	_baseX: 0,
	_baseY: 0,

	_ongoing: false,

	_bundle: null,

	_branch: null,

	install: function() {
		var branch = Services.prefs.getBranch("extensions.twofingerswipe.");
		if (!branch.prefHasUserValue("left"))
			branch.setCharPref("left", "nexttab");
		if (!branch.prefHasUserValue("right"))
			branch.setCharPref("right", "prevtab");
		if (!branch.prefHasUserValue("up"))
			branch.setCharPref("up", "blank");
		if (!branch.prefHasUserValue("down"))
			branch.setCharPref("down", "close");
	},

	uninstall: function() {
		var branch = Services.prefs.getBranch("extensions.twofingerswipe.");
		branch.clearUserPref("left");
		branch.clearUserPref("right");
		branch.clearUserPref("up");
		branch.clearUserPref("down");
	},

	init: function(aWindow) {
		this._window = aWindow;
		this._branch = Services.prefs.getBranch("extensions.twofingerswipe.");
		if (!aWindow.BrowserApp.deck) {
			alert("Error: BrowserApp.deck is null.");
			return;
		}
		aWindow.BrowserApp.deck.addEventListener("touchstart", this, false);
		aWindow.BrowserApp.deck.addEventListener("touchmove", this, false);
		aWindow._twoFingerSwipeMenuId = aWindow.NativeWindow.menu.add(this._getString("name"), null, function() {
			TwoFingerSwipe.config();
		});
	},

	uninit: function(aWindow) {
		if (aWindow._twoFingerSwipeMenuId != null)
			aWindow.NativeWindow.menu.remove(aWindow._twoFingerSwipeMenuId);
		this._window = null;
		this._bundle = null;
		this._branch = null;
		aWindow.BrowserApp.deck.removeEventListener("touchstart", this, false);
		aWindow.BrowserApp.deck.removeEventListener("touchmove", this, false);
	},

	handleEvent: function(event) {
		if (event.touches.length != this.fingers)
			return;
		var touch = event.touches.item(0);
		switch (event.type) {
			case "touchstart": 
				this._ongoing = true;
				this._baseX = touch.clientX;
				this._baseY = touch.clientY;
				break;
			case "touchmove": 
				if (!this._ongoing)
					return;
				var dx = touch.clientX - this._baseX;
				var dy = touch.clientY - this._baseY;
				if (Math.abs(dx) > this.threshold || Math.abs(dy) > this.threshold) {
					this._ongoing = false;
					var direction = Math.abs(dx) > Math.abs(dy) ? 
					                (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
					var command = this._branch.getCharPref(direction);
					this._executeCommand(command, event);
				}
				break;
			default: 
		}
	},

	_executeCommand: function(aCommand, aEvent) {
		var msg = "";
		var BrowserApp = this._window.BrowserApp;
		switch (aCommand) {
			case "back": 
				BrowserApp.selectedBrowser.goBack();
				break;
			case "forward": 
				BrowserApp.selectedBrowser.goForward();
				break;
			case "reload": 
				BrowserApp.selectedBrowser.reload();
				break;
			case "blank": 
				BrowserApp.addTab("about:blank");
				msg += " (" + BrowserApp.tabs.length + ")";
				break;
			case "close": 
				BrowserApp.closeTab(BrowserApp.selectedTab);
				var curPos = BrowserApp.tabs.indexOf(BrowserApp.selectedTab);
				var maxPos = BrowserApp.tabs.length - 1;
				msg += " (" + ++curPos + "/" + ++maxPos + ")";
				break;
			case "prevtab": 
			case "nexttab": 
				var curPos = BrowserApp.tabs.indexOf(BrowserApp.selectedTab);
				var maxPos = BrowserApp.tabs.length - 1;
				var newPos;
				if (aCommand == "prevtab")
					newPos = curPos - 1 >= 0 ? curPos - 1 : maxPos;
				else
					newPos = curPos + 1 <= maxPos ? curPos + 1 : 0;
				BrowserApp.selectTab(BrowserApp.tabs[newPos]);
				msg += " (" + ++newPos + "/" + ++maxPos + ")";
				break;
			case "top": 
			case "bottom": 
				var doc = aEvent.target.ownerDocument;
				doc.defaultView.focus();
				var evt = doc.createEvent("KeyEvents");
				evt.initKeyEvent(
					"keypress", true, true, null, false, false, false, false, 
					aCommand == "top" ? evt.DOM_VK_HOME : evt.DOM_VK_END, null
				);
				aEvent.target.dispatchEvent(evt);
				break;
			case "search": 
				var ret = { value: "" };
				var ok = Services.prompt.prompt(null, this._getString("search"), 
				                                this._getString("search.enter"), ret, null, {});
				if (!ok || !ret.value)
					return;
				var engine = Services.search.currentEngine;
				var submission = engine.getSubmission(ret.value);
				var tab = BrowserApp.addTab("about:blank");
				tab.browser.loadURI(submission.uri.spec, null, null, null, submission.postData);
				msg += " (" + ret.value + ")";
				break;
			default: 
				alert("Error: unknown command: " + aCommand);
				return;
		}
		this._window.NativeWindow.toast.show(this._getString(aCommand) + msg, "short");
	},

	config: function() {
		var title = this._getString("name") + " - " + this._getString("config");
		var directions = ["left", "right", "up", "down"];
		var ret = {};
		Services.prompt.select(
			null, title, this._getString("config.direction"), directions.length, 
			directions.map(function(dir) TwoFingerSwipe._getString(dir)), ret
		);
		var direction = directions[ret.value];
		var commands = ["back", "forward", "reload", "blank", "close", 
		                "prevtab", "nexttab", "top", "bottom", "search"];
		var command = this._branch.getCharPref(direction);
		commands.splice(commands.indexOf(command), 1);
		commands.unshift(command);
		var ret = {};
		Services.prompt.select(
			null, title, this._getString("config.command"), commands.length, 
			commands.map(function(cmd) TwoFingerSwipe._getString(cmd)), ret
		);
		command = commands[ret.value];
		this._branch.setCharPref(direction, command);
		command = this._branch.getCharPref(direction);
		var msg = this._getString("config.done") + "\n\n" + 
		          this._getString(direction) + " : " + this._getString(command);
		Services.prompt.alert(null, title, msg);
	},

	_getString: function(aName) {
		if (!this._bundle) {
			var uri = "chrome://twofingerswipe/locale/main.properties";
			this._bundle = Services.strings.createBundle(uri);
		}
		try {
			return this._bundle.GetStringFromName(aName);
		}
		catch (ex) {
			return aName;
		}
	},

};

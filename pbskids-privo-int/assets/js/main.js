(function()
{
	//Import classes
	var BasePanel = include('springroll.easeljs.BasePanel'),
		Container = include('createjs.Container');

	/**
	 * Panel contains all of the visual elements for the Game state
	 * @class pbskids.GamePanel
	 * @extends springroll.easeljs.BasePanel
	 */
	var GamePanel = function()
	{
		BasePanel.call(this);
	};

	//Super prototype
	var s = BasePanel.prototype;

	//Extend the base panel
	var p = extend(GamePanel, BasePanel);

	/**
	 * Setup the state, this happens on each state entering
	 */
	p.setup = function()
	{
		/**
		 * A public reference to 'this' for the scaling system
		 * @property {createjs.Container} scalingPanel
		 */
		this.scalingPanel = this;

		this.gameAssets = new lib.mushroom_assets();

		this.gameAssets.x = -179;
        this.gameAssets.y = -54;

		this.gameAssets.stump01.stop();
		this.gameAssets.stump02.stop();
		this.gameAssets.stump03.stop();
		this.gameAssets.submitButton.stop();

		this.addChild(this.gameAssets);
	};

	/**
	 * Un-setup the panel when exiting the state
	 */
	p.teardown = function()
	{
		s.teardown.call(this);

		//If scaling the panel directly using the "this.scalingPanel = this"
		//the panel's scale needs to be reset or it will start at the wrong 
		//scale on manager.refresh()
		this.scaleX = this.scaleY = 1;
		this.x = this.y = 0;
	};

	/**
	 * Don't use after this
	 */
	p.destroy = function()
	{
		this.scalingPanel = null;
		s.destroy.call(this);
	};

	//Assign to namespace
	namespace('pbskids').GamePanel = GamePanel;
}());
(function ()
{
	//Import classes
	var BaseState = include('springroll.easeljs.BaseState'),
		GamePanel = include('pbskids.GamePanel'),
		Bitmap = include('createjs.Bitmap'),
		DwellTimer = include('springroll.easeljs.DwellTimer'),
		Animator = include('springroll.Animator'),
		Tween = include('createjs.Tween'),
		Sound = include('springroll.Sound'),
		Container = include('createjs.Container'),
		Debug = include('springroll.Debug', false);

	/**
	 * Saved access to the Progress Tracker
	 * @param {springroll.easeljs.ProgressTracker} tracker
	 */
	var _learning;

	/**
	 * The logic for the title state
	 * @class pbskids.TitleState
	 * @extends springroll.easeljs.BaseState
	 */
	var GameState = function (options)
	{
		BaseState.call(this, new GamePanel(), options);

		// Bind the callback
		this.onPlayHelp = this.onPlayHelp.bind(this);
	};

	//Super prototype
	var s = BaseState.prototype;

	//Extend the base state
	var p = extend(GameState, BaseState);

	p.activeShrooms = [];
	p.pluckedShrooms = [];


	p.onAssetsLoaded = function ()
	{
		_assets = this.panel.gameAssets;
		_settings = this.game.config.gameSettings;
		_media = this.game.media;
		_hint = this.game.hints;

		this.stump01 = _assets.stump01;
		this.stump02 = _assets.stump02;
		this.stump03 = _assets.stump03;

		this.mushroom01 = _assets.mushroom01;
		this.mushroom02 = _assets.mushroom02;
		this.mushroom03 = _assets.mushroom03;
		this.mushroom04 = _assets.mushroom04;
		this.mushroom05 = _assets.mushroom05;

		this.stumps = [this.stump01, this.stump02, this.stump03];

		this.mushrooms = [this.mushroom01,
			this.mushroom02,
			this.mushroom03,
			this.mushroom04,
			this.mushroom05
		];

		this.animContainer01 = _assets.animContainer01;
		this.animContainer02 = _assets.animContainer02;
		this.animContainer03 = _assets.animContainer03;

		this.animContainers = [this.animContainer01,
			this.animContainer02,
			this.animContainer03
		];

		for (var zed = 0; zed < 3; zed++)
		{
			this.animContainers[zed].container.removeAllChildren();
			this.animContainers[zed].stop();
		}

		_dragManager = new springroll.easeljs.DragManager(this.game.display.stage, this.onDragStarted.bind(this), this.onDragEnded.bind(this));

		this.onMushroomDown = this.onMushroomDown.bind(this);
		this.onMushroomPull = this.onMushroomPull.bind(this);
		this.onMushroomRelease = this.onMushroomRelease.bind(this);

		this.onSubmitButton = this.onSubmitButton.bind(this);
		this.submitButton = _assets.submitButton;
		// this.submitButton.highlight.visible = false;

		for (var i = 0; i < this.mushrooms.length; i++)
		{
			var m = this.mushrooms[i];
			m.length = i + 1;
			m.name = "mushroom_" + m.length;
			DwellTimer.create(m);
			m.addEventListener('mousedown', this.onMushroomDown);
			m.addEventListener('pressmove', this.onMushroomPull);
			m.addEventListener('pressup', this.onMushroomRelease);
			_dragManager.addObject(m);
			m.guide.visible = false;
			m.cap.gotoAndStop(Math.randomInt(0, 2));
			m.cap.highlight.visible = false;
			m.stem.highlight.visible = false;
		}
	};

	/**
	 * After assets are loaded and state is fully entered
	 * @method  enterDone
	 */
	p.enterDone = function ()
	{
		// Handle when the help button is pressed
		this.game.container.on('playHelp', this.onPlayHelp);
		_learning = this.game.learning;

		_learning.startTimer("picking");
		_learning.startPicking();

		this.startInstruction();

		this.wrongAnswers = 0;
		this.shroomsPicked = 0;
		this.shroomsPlaced = false;
		this.firstPlacement = false;
		this.swap = null;

		this.playHint = this.playHint.bind(this);
		_hint.func(this.playHint);
		_hint.enabled = false;
		this.hintVO = 'Dot_PullMushrooms';

		//comparison for mushroom pull
		this.lastY = 0;
	};

	p.startInstruction = function ()
	{
		_hint.enabled = false;
		_media.playInstruction('Dot_PullMushrooms', this.nextInstruction.bind(this));
		// this.stump01.gotoAndStop(1);
	};

	p.nextInstruction = function ()
	{
		// if first time
		_media.playInstruction('Dot_PickFinger', this.endInstruction.bind(this));

		// this.stump01.gotoAndStop(0);
		// this.stump03.gotoAndStop(1);
	};

	p.endInstruction = function ()
	{
		// this.notes02.visible = false;
		this.stump03.gotoAndStop(0);
		_hint.enabled = true;
		this.submitButton.name = "submitButton";
		DwellTimer.create(this.submitButton);
		this.submitButton.addEventListener('click', this.onSubmitButton);
	};

	// grab mushroom stem to pull out of ground
	p.onMushroomDown = function (ev)
	{
		//Save start position:
		var shroom = ev.currentTarget;
		shroom.stem.startY = shroom.stem.y;
		shroom.cap.startY = shroom.cap.y;
		shroom.guide.startY = shroom.guide.y;
	};

	p.onMushroomPull = function (ev)
	{
		_hint.enabled = true;
		// springroll.Debug.log(ev);
		var shroom = ev.currentTarget;
		var point = shroom.globalToLocal(ev.stageX, ev.stageY);

		if (Debug) Debug.log(ev);

		if (point.y + this.lastY < 0)
		{
			if (shroom.stem.y > shroom.length * -75)
			{
				shroom.stem.y = point.y;
				shroom.cap.y = point.y;
				shroom.guide.y = point.y;
			}
			else
			{
				this.onMushroomPlucked(shroom, ev);
			}

			this.lastY = point.y;
		}

		//move mushroom upward within symbol
		//force drag when totally revealed
	};

	//release onto stage, allow for drag
	p.onMushroomRelease = function (ev)
	{
		//Return to start position
		var shroom = ev.currentTarget;
		shroom.mouseEnabled = false;
		Tween.get(shroom.stem).to(
		{
			y: shroom.stem.startY
		}, 250).call(function ()
		{
			shroom.mouseEnabled = true;
		});
		Tween.get(shroom.cap).to(
		{
			y: shroom.cap.startY
		}, 250);
		Tween.get(shroom.guide).to(
		{
			y: shroom.guide.startY
		}, 250);
	};

	p.onMushroomPlucked = function (shroom, ev)
	{
		_learning.event4025(
			shroom.length,
			this.game.normalizePosition(ev.stageX, ev.stageY)
		);

		var voBox = ['Dot_ThatsOne', 'Dot_Two', 'Dot_AndThree'];
		var vo = voBox[this.shroomsPicked];
		this.shroomsPicked++;

		_media.playCorrectFeedback(vo,
			function ()
			{
				if (this.shroomsPicked == 3)
					this.threeShrooms();
			}.bind(this));

		// immediately drag upon picking the mushroom?
		// _dragManager.startDrag(shroom, ev);
		// shroom.enableDrag();

		this.pluckedShrooms.push(shroom);

		Tween.get(shroom.stem).to(
		{
			y: shroom.length * -75
		}, 500);
		Tween.get(shroom.cap).to(
		{
			y: shroom.length * -75
		}, 500);

		shroom.startX = shroom.x;
		shroom.startY = shroom.y;

		shroom.removeEventListener('mousedown', this.onMushroomDown);
		shroom.removeEventListener('pressmove', this.onMushroomPull);
		shroom.removeEventListener('pressup', this.onMushroomRelease);

		if (this.shroomsPicked == 3)
		{
			if (_settings.limitShrooms)
			{
				for (var i = 0; i < this.mushrooms.length; i++)
				{
					this.mushrooms[i].removeEventListener('mousedown', this.onMushroomDown);
					this.mushrooms[i].removeEventListener('pressmove', this.onMushroomPull);
					this.mushrooms[i].removeEventListener('pressup', this.onMushroomRelease);
				}
			}
		}
	};

	p.threeShrooms = function ()
	{
		if (_settings.limitShrooms)
		{
			for (var i = 0; i < this.mushrooms.length; i++)
			{
				this.mushrooms[i].removeEventListener('mousedown', this.onMushroomDown);
				this.mushrooms[i].removeEventListener('pressmove', this.onMushroomPull);
				this.mushrooms[i].removeEventListener('pressup', this.onMushroomRelease);
			}
		}

		_learning.finishPicking(_learning.stopTimer('picking'));
		_learning.startTimer("round");
		_learning.startRound();

		_hint.enabled = false;
		_media.playInstruction('Dot_ShortHereTallHere', function() {_hint.enabled = true;}.bind(this), true);

		new springroll.DelayedCall(this.highlightShortest.bind(this), 1500);

	};

	p.highlightShortest = function ()
	{
		this.stump01.gotoAndStop(1);
		new springroll.DelayedCall(this.highlightTallest.bind(this), 1300);

	};

	p.highlightTallest = function ()
	{
		this.stump01.gotoAndStop(0);
		this.stump03.gotoAndStop(1);
		new springroll.DelayedCall(this.endHighlight.bind(this), 1300);
	};

	p.endHighlight = function ()
	{
		this.stump03.gotoAndStop(0);
		this.submitButton.addEventListener('click', this.onSubmitButton);

		this.hintVO = 'Dot_DragStumps';
		this.game.hints.startTimer();

		this.stumpsActive = true;

		this.pluckedShrooms.sort(function (a, b)
		{
			return a.length - b.length;
		});

		for (var i = 0; i < 3; i++)
		{
			this.pluckedShrooms[i].enableDrag();
		}
	};

	p.getStumps = function ()
	{
		var stumpz = [];
		for (var i in this.activeShrooms)
		{
			if (this.activeShrooms[i])
			{
				stumpz.push(this.activeShrooms[i].length);
			}
			else
			{
				stumpz.push(0);
			}
		}
		return stumpz;
	};
	p.intToLocation = function (locationInt)
	{
		if (locationInt === null || locationInt === undefined)
			locationInt = 9000;

		var location;

		switch (locationInt)
		{
			case 0:
				location = "left";
				break;
			case 1:
				location = "middle";
				break;
			case 2:
				location = "right";
				break;
			default:
				location = "resources";
				break;
		}
		console.trace("intToLoc:", locationInt, location);
		return location;
	};

	p.onDragStarted = function (shroom)
	{
		if (shroom.placed)
			Sound.instance.play("SFX_mushroomclick");
		else
			Sound.instance.play('SFX_mushroompop');

		shroom.parent.setChildIndex(shroom, shroom.parent.children.length - 2);
		this.swap = null;
		for (var i = 0; i < 3; i++)
		{
			if (this.activeShrooms[i] && shroom.x > this.stumps[i].x - _settings.snapThreshold && shroom.x < this.stumps[i].x + _settings.snapThreshold &&
				shroom.y > this.stumps[i].y - _settings.snapThreshold && shroom.y < this.stumps[i].y + _settings.snapThreshold)
			{
				shroom.placed = false;
				this.activeShrooms[i] = null;
				this.swap = i;
				break;
			}

		}

		_learning.startTimer("drag");
		_learning.startDrag(
			shroom.length,
			this.getStumps(),
			this.game.normalizePosition(this.game.display.stage.mouseX, this.game.display.stage.mouseY),
			this.intToLocation(this.swap)
		);
	};

	p.onDragEnded = function (shroom)
	{
		shroom.placed = false;

		var destination;

		// if shroom is placed in 1 of 3 available positions, tween to position, add to appropriate active shroom spot
		for (var i = 0; i < 3; i++)
		{

			if (this.stumpsActive && shroom.x > this.stumps[i].x - _settings.snapThreshold && shroom.x < this.stumps[i].x + _settings.snapThreshold &&
				shroom.y > this.stumps[i].y - _settings.snapThreshold - 25 && shroom.y < this.stumps[i].y + _settings.snapThreshold)
			{
				this.game.hints.stopTimer();

				Sound.instance.play('SFX_mushroomplace');
				if (this.swap !== null && this.swap != i)
				{
					var swapShroom = this.activeShrooms[i];
					this.activeShrooms[this.swap] = swapShroom;
					if (swapShroom)
					{
						Tween.get(swapShroom).to(
						{
							x: this.stumps[this.swap].x,
							y: this.stumps[this.swap].y + 15
						}, _settings.tweenRate);
					}
				}

				//TODO: I don't see why this is necessary given the if statement above... -EE
				if (this.activeShrooms[i])
				{
					Tween.get(this.activeShrooms[i]).to(
					{
						x: this.activeShrooms[i].startX,
						y: this.activeShrooms[i].startY
					}, _settings.tweenRate);
				}


				shroom.placed = true;
				this.activeShrooms[i] = shroom;

				Tween.get(shroom).to(
				{
					x: this.stumps[i].x,
					y: this.stumps[i].y + 15
				}, _settings.tweenRate);

				// springroll.Debug.log(this.activeShrooms);
				destination = i;
				break;
			}
		}

		if (!shroom.placed)
		{
			if (shroom.y < this.stump01.y + _settings.snapThreshold)
			{
				_learning.endDragOutside(
					shroom.length,
					this.intToLocation(this.swap),
					this.game.normalizePosition(this.game.display.stage.mouseX, this.game.display.stage.mouseY),
					_learning.stopTimer("drag")
				);
			}
			else
			{
				_learning.event4040(
					shroom.length,
					this.game.normalizePosition(this.game.display.stage.mouseX, this.game.display.stage.mouseY),
					this.getStumps(),
					this.intToLocation(this.swap),
					_learning.stopTimer("drag")
				);
			}

			// Sound.instance.play('TweenBack');
			Tween.get(shroom).to(
			{
				x: shroom.startX,
				y: shroom.startY
			}, _settings.tweenRate);
		}
		else
		{

			_learning.selectAnswer(
				shroom.length,
				this.intToLocation(destination),
				this.getStumps(),
				this.pluckedShrooms[this.activeShrooms.indexOf(shroom)] == shroom,
				this.intToLocation(this.swap),
				_learning.stopTimer('drag'),
				this.game.normalizePosition(this.game.display.stage.mouseX, this.game.display.stage.mouseY)
			);
		}

		this.shroomsPlaced = false;

		for (var z = 0; z < 3; z++)
		{
			if (!this.activeShrooms[z])
			{
				this.shroomsPlaced = false;
				break;
			}
			else
			{
				this.shroomsPlaced = true;
			}
		}

		if (this.shroomsPlaced && !this.firstPlacement)
		{

			this.firstPlacement = true;
			this.submitButton.gotoAndStop(2);
			_hint.enabled = false;
			_media.playInstruction('Dot_CheckTapHere',
				function ()
				{
					_hint.enabled = true;
					if (Debug) Debug.log('hintchange');
					this.hintVO = 'Dot_CheckTapHere';
					_hint.startTimer();
					this.submitButton.gotoAndStop(0);
				}.bind(this));
		}
	};

	p.onSubmitButton = function ()
	{
		_hint.stopTimer();
		var feedbackArray = [];

		if (!this.submitted)
		{
			Sound.instance.play("SFX_donebutton");
			// Sound.instance.play('SFX_ButtonClick');
			this.submitted = true;
			this.submitButton.gotoAndStop(1);
			_hint.enabled = false;

			//compare active mushroom Array to Statue Array and populate correctAnswer Array
			if (this.shroomsPlaced)
			{
				this.answer = true;
				if (this.activeShrooms[2].length > this.activeShrooms[1].length &&
					this.activeShrooms[1].length > this.activeShrooms[0].length)
					this.answer = true;
				else
					this.answer = false;

				this.onAnswer(this.answer);
			}
			else
			{
				// springroll.Debug.red("not enough shrooms");
				this.onAnswer(false);
				_media.playIncorrectFeedback("Dot_DragStumps", this.endFeedback.bind(this));

			}

		}

	};

	p.onAnswer = function (answer)
	{
		_learning.submitAnswer(
			answer,
			this.getStumps()
		);
		if (answer === true)
		{
			Sound.instance.play("SFX_correctanswer");
			_media.playCorrectFeedback('Dot_AlrightThisLittleThisBig');
			new springroll.DelayedCall(this.highlightShortestMushroom.bind(this), 1300);

			for (var i = 0; i < this.mushrooms.length; i++)
			{
				this.mushrooms[i].disableDrag();
			}

		}
		else if (answer === false && this.shroomsPlaced)
		{
			Sound.instance.play("SFX_wronganswer");
			this.wrongAnswers++;
			this.startFeedback();

		}
	};

	p.highlightShortestMushroom = function ()
	{
		this.activeShrooms[0].stem.highlight.visible = true;
		this.activeShrooms[0].cap.highlight.visible = true;
		new springroll.DelayedCall(this.highlightTallestMushroom.bind(this), 1500);

	};

	p.highlightTallestMushroom = function ()
	{
		this.activeShrooms[0].stem.highlight.visible = false;
		this.activeShrooms[0].cap.highlight.visible = false;
		this.activeShrooms[2].stem.highlight.visible = true;
		this.activeShrooms[2].cap.highlight.visible = true;
		new springroll.DelayedCall(this.endHighlightMushroom.bind(this), 2000);
	};

	p.endHighlightMushroom = function ()
	{
		this.activeShrooms[2].stem.highlight.visible = false;
		this.activeShrooms[2].cap.highlight.visible = false;


		this.shroomDance();


	};

	p.shroomDance = function ()
	{
		Sound.instance.play('SFX_completedtask');

		for (var i = 0; i < 3; i++)
		{
			var shroom = this.activeShrooms[i];
			var ac = this.animContainers[i];
			var point = _assets.localToLocal(shroom.x, shroom.y, ac.container);
			shroom.x = point.x;
			shroom.y = point.y;
			shroom.scaleX = shroom.scaleY = shroom.scaleX / ac.container.scaleX;
			ac.container.addChild(shroom);
			Animator.play(ac, 'bounce');
		}
		_learning.endRound(
			_learning.stopTimer('round'),
			this.wrongAnswers
		);
		new springroll.DelayedCall(this.endGame.bind(this), 4000);
	};

	p.startFeedback = function ()
	{

		if (this.wrongAnswers < 2)
			_media.playIncorrectFeedback('Dot_NotShortToTall', this.endFeedback.bind(this));
		else
		{
			var correctShroomHeights = this.activeShrooms.slice(0);

			correctShroomHeights.sort(function (a, b)
			{
				if (a.length > b.length)
				{
					return 1;
				}
				if (a.length < b.length)
				{
					return -1;
				}
				// a must be equal to b
				return 0;
			});

			// springroll.Debug.green(correctShroomHeights);
			// springroll.Debug.red(this.activeShrooms);

			for (var i = 0; i < this.activeShrooms.length; i++)
			{
				this.activeShrooms[i].disableDrag();
				this.activeShrooms[i].guide.y = correctShroomHeights[i].length * -75 - 155;
				this.activeShrooms[i].guide.visible = true;
				if (Debug) Debug.log(this.activeShrooms[i].guide);
			}

			_media.playIncorrectFeedback('Dot_TheseLinesShow', this.endFeedback.bind(this));
		}
	};

	p.endGame = function ()
	{
		this.game.endGame();
	};

	p.endFeedback = function ()
	{
		for (var i = 0; i < this.activeShrooms.length; i++)
		{
			if (this.activeShrooms[i])
			{
				this.activeShrooms[i].enableDrag();
				this.activeShrooms[i].guide.visible = false;
			}
		}

		// this.doitRight.visible = false;
		_hint.enabled = true;
		this.submitted = false;
		this.submitButton.gotoAndStop(0);
	};
	/**
	 * Listens for playHelp message fired by the Help button
	 * on the game Container module
	 * @method  onPlayHelp
	 * @private
	 */
	p.onPlayHelp = function ()
	{
		_learning.clickHelp(
			this.getStumps(),
			this.stumpsActive ? "arranging" : "picking"
		);
		//this.playHint();
	};

	p.playHint = function ()
	{
		if (this.hintVO == 'Dot_CheckTapHere')
			this.submitButton.gotoAndStop(2);
			_hint.enabled = false;
		_media.playInstruction(this.hintVO,
			function ()
			{
				this.submitButton.gotoAndStop(0);
				_hint.enabled = true;
			}.bind(this));
	};

	/**
	 * When the state starts to exit, before transition
	 * @method  exitStart
	 */
	p.exitStart = function ()
	{
		this.game.container.off('playHelp', this.onPlayHelp);
	};

	//Assign to namespace
	namespace('pbskids').GameState = GameState;
}());
(function()
{
	// Library depencencies
	var Application = include('springroll.Application'),
		Game = include('springroll.Application'),
		ListTask = include('springroll.ListTask');

	// Create a new application
	var app = new Application(
	{
		fps: 30,
		name: 'TreetopMushroomLength', // Name of the game
		state: 'game', // Initial state
		configPath:'assets/config/config.json',
		captionsPath: 'assets/config/captions.json',
		manifestsPath: 'assets/config/manifests.json',
		alp: {
            appSecret:"gLT3kMNM8BmTDrdVpWGD3N12VzAZPO6C",
            version:{
                version:"1.0.0",
                build:"1000"
            },
			apiJsonUrl: "https://kidapt.github.io/kidaptive-sdk-js-demo/pbskids-privo-int/swagger.json"
        }
	});

	// Handle when app is ready to use
	app.on('init', function ()
	{
		//Tween JS way chuggy
		createjs.Ticker.framerate = 60;

		// Log out the qeury options
		if (true && springroll.DebugOptions)
		{
			springroll.DebugOptions
				.string('state', 'game')
				.boolean('mute', 'mute all sounds')
				.log();
		}

		var scalingSize = this.config.scalingSize;
		this.offset = {
			x: -(scalingSize.maxWidth - scalingSize.width) / 2,
			y: -(scalingSize.maxHeight - scalingSize.height) / 2
		};

		this.transition = new lib.Transition();
		this.states = {
			game: new pbskids.GameState({
				scaling: this.config.scaling.game,
				manifest: this.manifests.mushroom_assets
			})
		};
        app.container.send('requestOpenIdAuth', app.config.openid);

        app.container.on('openIdAuthSuccess', function(event) {
            console.log('Successful single auth:', event.data.name);
            if (event.data.name == "Kidaptive ALP") {
            	app.alp.refreshUser();
			}
        });

        app.container.on('openIdAuthFinished', function(event) {
            console.log('All clients authenticated:', event.data);
        });

	});

	// Assign to the window for easy access
	window.app = app;
}());
//# sourceMappingURL=main.js.map
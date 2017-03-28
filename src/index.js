import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';

import CreateLearner from './js/CreateLearner';
import QuizPrompt from './js/QuizPrompt';

let createLearner = ReactDOM.render(
    // <CreateLearner/>,
    <QuizPrompt/>,
    document.getElementById('root')
);

window.KidaptiveSdk.init('gPt1fU+pTaNgFv61Qbp3GUiaHsGcu+0h8', {version:"1.0.0", build:"1"}).then(function(sdk) {
    window.sdk = sdk;

    //bypass promptCategory validation; Category data missing.
    sdk.modelManager.promptCategories = {};

    // createLearner.setState({sdkReady: true});
    window.learner = sdk.getLearnerList()[0];
    sdk.startTrial(window.learner.id);

    return sdk;
});



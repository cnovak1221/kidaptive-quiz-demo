import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';

import CreateLearner from './js/CreateLearner';
import QuizSelect from './js/QuizSelect';

let createLearner = ReactDOM.render(
    // <CreateLearner/>,
    <QuizSelect/>,
    document.getElementById('root')
);

window.KidaptiveSdk.init('gPt1fU+pTaNgFv61Qbp3GUiaHsGcu+0h8', {version:"1.0.0", build:"1"}).then(function(sdk) {
    window.sdk = sdk;
    // createLearner.setState({sdkReady: true});

    return sdk;
});



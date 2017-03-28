/**
 * Created by solomonliu on 2017-03-26.
 */
import React, {Component} from 'react';
import background from '../img/math-quiz-background.png';
import exit from '../img/exit.svg';
import circle from '../img/circle.svg';
import square from '../img/square.svg';
import triangle from '../img/triangle.svg';
import green from '../img/green.svg';
import red from '../img/red.svg';
import blue from '../img/blue.svg';
import small from '../img/small.svg';
import medium from '../img/medium.svg';
import large from '../img/large.svg';
import progress from '../img/progress.svg';
import trophyWhite from '../img/trophy-white.svg';
import trophyGrey from '../img/trophy-grey.svg';
import add from '../img/add.svg';
import correctInvert from '../img/correct-invert.svg';
import correct from '../img/correct.svg';
import incorrectInvert from '../img/incorrect-invert.svg';

let PROMPT = [[circle, square, triangle], [green, red, blue], [small, medium, large]];
let PROMPT_IMG_POS = [[[24,37], [76,37], [128, 37]], [[24,37], [76,37], [128, 37]], [[24, 60],[62,45],[113,29]]];
let PROMPT_TEXT = [['circle', 'square', 'triangle'], ['green', 'red', 'blue'], ['small', 'medium', 'large']];
let COLOR_HEX = ['#3FBB65', '#F34E4A', '#1B93C0'];
let SIZE = [30, 70, 110];
let PROMPT_ROOT='/prompt/kidaptive/quiz_demo/';
let ITEM_ROOT='/item/kidaptive/';
let DIM_ROOT='/dimension/early_learning_framework/';
let DIMS = ['shape_identification','color_recognition','categorization'];

let shuffle = function(array) {
    for (let i = 0; i < array.length; i++) {
        let temp = array[i];
        let j = i + Math.floor(Math.random() * (array.length - i));
        array[i] = array[j];
        array[j] = temp;
    }
};

let maskToIndex = function(mask) {
    if (!mask) {
        return [];
    }

    let length = Math.floor(Math.log2(mask)) + 1;
    return Array.apply(null, new Array(length)).map((v,i)=>i)
        .filter(v=>(mask & (1 << v)) > 0);
};

class QuizPrompt extends Component {

    constructor(props) {
        super(props);
        let state = QuizPrompt.newPromptState();
        this.state = {
            prompt: state.prompt, //bits in this number represent whether each shape, color and size should be included
            answer: 0, //(answer & (1 << x)) > 0 indicates whether answer x is selected
            choices: state.choices, //array of number 0-26. base3 representation indicates which shape, color and sice the choice is
            progress: 0, //number of questions completed
            showingAnswers: 0 //0 = showing prompt, 1 = incorrect answer, 2 = correct answer
        };
    }

    static checkMatch(prompt, answer) {
        let match = 0;
        for (let j = 0; j < 3; j++) {
            match += ((prompt >> 3 * j) & 7 & (1 << Math.floor(answer / 3 ** j) % 3)) > 0;
        }
        return match;
    }

    static newPromptState() {
        let newPrompt = 511;
        while (newPrompt === 511) {
            newPrompt = 0;
            for (let i = 0; i < 3; i++) {
                newPrompt = (newPrompt << 3) | Math.floor(Math.random() * 7) + 1;
            }
        }

        let full = [];
        let partial = [];
        let none = [];

        for (let i = 0; i < 27; i++) {
            let match = QuizPrompt.checkMatch(newPrompt, i);
            if (match === 3) {
                full.push(i);
            } else if (match === 0) {
                none.push(i);
            }  else {
                partial.push(i);
            }
        }

        shuffle(full);
        shuffle(partial);
        shuffle(none);

        let choices = full.slice(0, Math.min(full.length, 2)).concat(none.slice(0, Math.min(none.length, 2)));
        choices = choices.concat(partial.slice(0, 6 - choices.length));
        shuffle(choices);

        return {
            prompt: newPrompt,
            choices: choices
        }
    }

    static findComp(array, mask) {
        let index = maskToIndex(mask);
        if (index.length === 1) {
            let comp = array[index[0]];
            return comp ? comp : '';
        }

        index = maskToIndex(mask ^ 7);
        if (index.length === 1) {
            let comp = array[index[0]];
            return comp ? 'not_' + comp : '';
        }
    }

    static getPromptUri(mask) {
        let color = QuizPrompt.findComp(PROMPT_TEXT[1], (mask >> 3) & 7);
        let shape = QuizPrompt.findComp(PROMPT_TEXT[0], mask & 7);
        let size = QuizPrompt.findComp(PROMPT_TEXT[2], (mask >> 6) & 7);

        if (shape && size && !color) {
            return [size, shape].join('_');
        }

        return [color, shape, size].filter(v=>v!=null).join('_');
    }

    checkAnswer() {
        this.setState(function(state) {
            //figure out the correct answer;
            let correct = 0;
            for (let i in state.choices) {
                if (QuizPrompt.checkMatch(state.prompt, state.choices[i]) === 3) {
                    correct |= 1 << i
                }
            }

            let newState = {progress: state.progress + 1};

            //differences between given and correct answers
            let errors = correct ^ state.answer;

            if (errors) {
                newState.showingAnswers=1;
            } else {
                newState.showingAnswers=2;
            }

            //build prompt uri and get item list
            let promptUriLeaf = QuizPrompt.getPromptUri(state.prompt);
            let promptUri = PROMPT_ROOT + promptUriLeaf;

            if (window.sdk.getEntityByUri('prompt', promptUri)) {
                let items = window.sdk.getItems(null, promptUri);
                let categories = window.sdk.getCategories(promptUri);
                //TODO: generate promptAnswers
                let promptAnswers = {};
                categories.forEach(v=>promptAnswers[v.uri]='n/a');
                let attempts = [];
                if (errors) {
                    if (errors & correct) {
                        //false negatives generate false attempts on all items
                        attempts = items.map(function (i) {
                            return {itemURI: i.uri, outcome: false}
                        });
                    } else {
                        //TODO:false positives generate false attempts on the affected dimensions
                        let fPos = errors & state.answer;
                        attempts = items.map(function (i) {
                            return {itemURI: i.uri, outcome: false}
                        });
                    }
                } else {
                    //correct answers generate true attempt on all items
                    attempts = items.map(function (i) {
                        return {itemURI: i.uri, outcome: true}
                    });
                }
                window.sdk.reportEvidence('QuizDemoPrompt', window.learner.id, promptUri,attempts, {promptAnswers: promptAnswers});
            }
            console.log('questions completed: ' + newState.progress);
            return newState;
        });

    }

    nextPrompt() {
        this.setState(function(state) {
            let newState = QuizPrompt.newPromptState();
            newState.answer = 0;
            newState.showingAnswers = 0;
            console.log('Shapes: ' + window.sdk.getLatentAbility(window.learner.id,DIM_ROOT+DIMS[0]).mean);
            console.log('Colors: ' + window.sdk.getLatentAbility(window.learner.id,DIM_ROOT+DIMS[1]).mean);
            console.log('Categorization: ' + window.sdk.getLatentAbility(window.learner.id,DIM_ROOT+DIMS[2]).mean);
            if (state.progress === 5) {
                window.sdk.startTrial(window.learner.id);
                newState.progress = 0;
            }
            return newState;
        });
    }

    render() {
        return (
            <div style={{
                background: 'url(' + background + ')',
                width: '100%',
                minHeight: '100%',
                paddingBottom: '207px'
            }}>
                <div style={{
                    width: '968px',
                    top: '80px',
                    margin: 'auto',
                }}>
                    <div className="container" style={{
                        overflow: 'hidden',
                        padding: '111px 0 122px'
                    }}>
                        <div style={{
                            position:'absolute',
                            top:'30px',
                            right:'40px'
                        }}>
                            <img
                                src={this.state.progress < 5 ? trophyGrey : trophyWhite}
                                style={{
                                    position:'absolute',
                                    top:'18px',
                                    right:'17px'
                                }}
                                alt=""
                            />
                            <img
                                src={progress}
                                alt=""
                            />
                        </div>
                        <div style={{
                            padding: '0 144px'
                        }}>
                            <div>
                            {
                                function() {
                                    let prompts = [];
                                    for (let x = 0; x < 5; x++) {
                                        let index = Math.floor(x / 2);
                                        if (x % 2){
                                            prompts.push(<img
                                                key={'prompt-add-' + index}
                                                src={add}
                                                alt=""
                                                style={{
                                                    bottom:'49px',
                                                    left: 23 * x + 'px'
                                                }}
                                            />);
                                        } else {
                                            prompts.push(<PromptCard
                                                index={index}
                                                key={'prompt-card-' + index}
                                                div={{
                                                    style: {
                                                        left: 23 * x + 'px'
                                                    }
                                                }}
                                                img={PROMPT[index]}
                                                imgPos={PROMPT_IMG_POS[index]}
                                                imgState={(this.state.prompt >> (index * 3)) & 7}
                                            />);
                                        }
                                    }
                                    return prompts;
                                }.bind(this)()
                            }
                            </div>
                            <div style={{top:'60px', paddingBottom:'30px', verticalAlign:'center'}}>
                            {
                                function() {
                                    let answers = [];
                                    for (let y = 0; y < 2; y++) {
                                        for (let x = 0; x < 3; x++) {
                                            let index = x + y * 3;
                                            answers.push(<AnswerCard
                                                index={index}
                                                key={'answer-card-' + index}
                                                button={{
                                                    style: {
                                                        top: y * 30 + 'px',
                                                        left: x * 58 + 'px'
                                                    }
                                                }}
                                                choice={this.state.choices[index]}
                                                parent={this}
                                            />);
                                        }
                                    }
                                    return answers;
                                }.bind(this)()
                            }
                            </div>
                        </div>
                        <div
                            id="quiz-bottom-bar"
                            className={this.state.showingAnswers ? (this.state.showingAnswers - 1 ? 'success' : 'failure') : ''}
                            style={{top: '122px'}}>
                            {
                                this.state.showingAnswers ? (
                                    this.state.showingAnswers - 1 ? <div
                                        style={{
                                            position: 'absolute',
                                            left:'120px',
                                            bottom:'28px',
                                        }}
                                    >
                                        <img
                                            src={correctInvert}
                                            alt=""
                                            style={{verticalAlign: 'middle'}}
                                        />
                                        <h1 style={{
                                            left: '10px',
                                            color: '#ffffff',
                                            fontWeight: 'bold',
                                            verticalAlign: 'middle',
                                            display:'inline'
                                        }}>Correct!</h1>
                                    </div> : <div
                                        style={{
                                            position: 'absolute',
                                            left:'120px',
                                            height:'100%',
                                            width:'100%'
                                        }}
                                    >
                                        <img
                                            src={incorrectInvert}
                                            alt=""
                                            style={{
                                                position:'absolute',
                                                bottom: '28px'
                                            }}
                                        />
                                        <h1 style={{
                                            color: '#ffffff',
                                            fontWeight: 'bold',
                                            position:'absolute',
                                            left: '55px',
                                            bottom: '42px'
                                        }}>Incorrect!</h1>
                                        <p style={{
                                            color: '#ffffff',
                                            position:'absolute',
                                            left:'55px',
                                            bottom:'23px',
                                        }}>Check the correct answer</p>
                                    </div>
                                ) : <button
                                    className='secondary'
                                    style={{
                                        position: 'absolute',
                                        width: '136px',
                                        left: '40px',
                                        bottom: '28px'
                                    }}
                                    onClick={this.nextPrompt.bind(this)}
                                >Skip</button>
                            }
                            <button
                                className='primary'
                                style={{
                                    position: 'absolute',
                                    width: '136px',
                                    right: '40px',
                                    bottom: '28px'
                                }}
                                onClick={this.state.showingAnswers ? this.nextPrompt.bind(this) : this.checkAnswer.bind(this)}
                            >{this.state.showingAnswers ? 'Continue' : 'Check'}</button>
                        </div>
                    </div>
                    <img src={exit} alt='' style={{
                        position: 'absolute',
                        top: '-10px',
                        right: '-10px',
                    }}/>
                </div>

            </div>
        )
    }
}

class PromptCard extends Component {
    render() {
        return(
            <div className='prompt-card' {... this.props.div}>
                {
                    function() {
                        let imgs = [];
                        for (let i in this.props.img) {
                            let pos = this.props.imgPos[i];
                            imgs.push(<img
                                key={'img-' + i}
                                src={this.props.img[i]}
                                alt=""
                                style={{
                                    position:'absolute',
                                    top: pos[1],
                                    left: pos[0],
                                    opacity: (this.props.imgState & (1 << i)) ? 1 : .2
                                }}
                            />);
                        }
                        return(imgs);
                    }.bind(this)()
                }
            </div>
        )
    }
}

class AnswerCard extends Component {

    select() {
        this.props.parent.setState((prevState) => {
            if (!prevState.showingAnswers) {
                let mask = 1 << this.props.index;
                let newState = prevState.answer ^ mask;
                return {answer: newState};
            }
        });
    }

    render() {
        let shape = this.props.choice % 3;
        let color = COLOR_HEX[Math.floor(this.props.choice / 3) % 3];
        let size = SIZE[Math.floor(this.props.choice / 9) % 3];
        let selected = this.props.parent.state.answer & (1 << this.props.index) ? 3 : 0;

        return (
            <button
                className={"container answer-card" + (selected ? " active" : "")}
                onClick={this.select.bind(this)}
                disabled={this.props.parent.state.showingAnswers}
                {... this.props.button}
            >
                <svg style={{width: size + 'px', height: size + 'px', position:'absolute', left: 94 - selected - size / 2 + 'px', top: 70 - selected - size / 2 + 'px'}} viewBox="0 0 100 100">
                    {
                        function() {
                            if (shape === 0) {
                                return <circle cx='50px' cy='50' r='50' fill={color}/>;
                            } else if (shape === 1) {
                                return <rect width='100' height='100' fill={color}/>;
                            } else if (shape === 2) {
                                return <polygon points='100,100 50,0 0,100' fill={color}/>
                            }
                        }()
                    }
                </svg>
                {
                    (this.props.parent.state.showingAnswers && (QuizPrompt.checkMatch(this.props.parent.state.prompt, this.props.choice))===3) ?
                        <img
                            src={correct}
                            alt=""
                            style={{
                                position: 'absolute',
                                left: '10' - selected + 'px',
                                top: '10' - selected + 'px'
                            }}
                        /> : null
                }
            </button>
        )
    }
}


export default QuizPrompt;
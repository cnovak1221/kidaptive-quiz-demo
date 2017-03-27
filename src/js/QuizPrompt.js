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
import trophyGrey from '../img/trophy-grey.svg'

let PROMPT_Y = [111];
let PROMPT_X = [162, 390, 618];
let ANSWER_Y = [281, 451];
let ANSWER_X = [144, 390, 636];
let PROMPT = [[circle, square, triangle], [green, red, blue], [small, medium, large]];
let PROMPT_IMG_POS = [[[24,37], [76,37], [128, 37]], [[24,37], [76,37], [128, 37]], [[24, 60],[62,45],[113,29]]];
let PROMPT_TEXT = [['CIRCLE', 'SQUARE', 'TRIANGLE'], ['GREEN', 'RED', 'BLUE'], ['SMALL', 'MEDIUM', 'LARGE']];
let COLOR_HEX = ['#3FBB65', '#F34E4A', '#1B93C0'];
let SIZE = [30, 60, 90];

let shuffle = function(array) {
    for (let i = 0; i < array.length; i++) {
        let temp = array[i];
        let j = i + Math.floor(Math.random() * (array.length - i));
        array[i] = array[j];
        array[j] = temp;
    }
};

class QuizPrompt extends Component {

    constructor(props) {
        super(props);
        let state = QuizPrompt.newPromptState();
        this.state = {
            prompt: state.prompt,
            answer: 0,
            choices: state.choices,
            progress: 0
        };
    }

    static newPromptState() {
        let newPrompt = 511;
        let promptComps = [];
        while (newPrompt === 511) {
            newPrompt = 0;
            for (let i = 0; i < 3; i++) {
                promptComps[i] = Math.floor(Math.random() * 7) + 1;
                newPrompt |= (promptComps[i] << (3 * i));
            }
        }

        let full = [];
        let partial = [];
        let none = [];

        for (let i = 0; i < 27; i++) {
            let match = 0;
            for (let j = 0; j < 3; j++) {
                match += ((promptComps[j] & (1 << (Math.floor(i / (3 ** j)) % 3))) > 0)
            }
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

    render() {
        return (
            <div style={{
                background: 'url(' + background + ')',
                width: '100%',
                minHeight: '100%',
                paddingTop: '80px'
            }}>
                <div style={{
                    width: '968px',
                    height: '753px',
                    margin: 'auto',
                    position: 'relative'
                }}>
                    <div className="container" style={{
                        width: '100%',
                        height: '100%',
                        overflow: 'hidden',
                        position: 'relative'
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
                                style={{position:'relative'}}
                                alt=""
                            />
                        </div>
                        {
                            function() {
                                let prompts = [];
                                for (let y in PROMPT_Y) {
                                    for (let x in PROMPT_X) {
                                        let index = Number(x) + y * PROMPT_X.length;
                                        prompts.push(<PromptCard
                                            index={index}
                                            key={'prompt-card-' + index}
                                            div={{
                                                style: {
                                                    top: PROMPT_Y[y],
                                                    left:PROMPT_X[x]
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
                        {
                            function() {
                                let answers = [];
                                for (let y in ANSWER_Y) {
                                    for (let x in ANSWER_X) {
                                        let index = Number(x) + y * PROMPT_X.length;
                                        answers.push(<AnswerCard
                                            index={index}
                                            key={'answer-card-' + index}
                                            button={{
                                                style: {
                                                    top: ANSWER_Y[y],
                                                    left:ANSWER_X[x]
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
            let mask = 1 << this.props.index;
            let newState = prevState.answer ^ mask;
            return {answer: newState};
        });
    }

    render() {
        let shape = this.props.choice % 3;
        let color = Math.floor(this.props.choice / 3) % 3;
        let size = Math.floor(this.props.choice / 9) % 3;

        return (
            <button
                className={"container answer-card" + ((this.props.parent.state.answer & (1 << this.props.index)) ? " active" : "")}
                onClick={this.select.bind(this)}
                {... this.props.button}
            >
                {/*<svg style={{position:'absolute', top:70 - SIZE[size] / 2 + 'px', left:94 - SIZE[size] / 2 + 'px'}}>*/}
                <svg style={{width: SIZE[size] + 'px', height: SIZE[size] + 'px', margin:'auto'}} viewBox='-100 -100 200 200' preserveAspectRatio="xMidYMid">
                    {
                        function() {
                            if (shape === 0) {
                                return <circle r='100' fill={COLOR_HEX[color]}/>;
                            } else if (shape === 1) {
                                return <rect x='-100' y='-100' width='200' height='200' fill={COLOR_HEX[color]}/>;
                            } else if (shape === 2) {
                                return <polygon points='100,100 0,-100 -100,100' fill={COLOR_HEX[color]}/>
                            }
                        }()
                    }
                </svg>
            </button>
        )
    }
}


export default QuizPrompt;
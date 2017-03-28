/**
 * Created by solomonliu on 2017-03-28.
 */
import React, {Component} from 'react';
import ReactDOM from 'react-dom';
import QuizSelect from './QuizSelect';

import background from '../img/math-quiz-background.png';
import trophyHeader from '../img/trophy-header.svg';

class QuizComplete extends Component {
    quizSelect() {
        ReactDOM.render(
            <QuizSelect/>,
            document.getElementById('root')
        )
    }

    render() {
        console.log(this.props.improved);
        return(
            <div style={{
                background: 'url(' + background + ')',
                width: '100%',
                minHeight: '100%',
                paddingBottom: '200px',
                boxSizing: 'border-box'
            }}>
                <div className="container" style={{
                    overflow: 'hidden',
                    padding: '30px 0 152px',
                    margin: 'auto',
                    width: '968px',
                    top: '100px',
                }}>
                    {/*main content*/}
                    <div style={{
                        padding: '0 300px'
                    }}>
                        <img
                            src={trophyHeader}
                            alt=""
                            style={{
                                width:'369px',
                                margin:'auto',
                                display:'block'
                            }}
                        />
                        <h2
                            style={{
                                textAlign:'center',
                                width:'100%',
                                fontWeight:'bold',
                                top: '30px'
                            }}
                        >Quiz Complete!</h2>
                        <div style={{
                            top:'60px',
                            width: '100%'
                        }}>
                            <p>Shape Identification</p>
                            <p
                                style={{
                                    position: 'absolute',
                                    right:0,
                                    top:0,
                                    fontWeight:'bold',
                                    color: this.props.improved['shape_identification'] ? '#03a9f4':'#999999'
                                }}
                            >{this.props.improved['shape_identification'] ? 'Improved': 'Needs Practice'}</p>
                        </div>
                        <div style={{
                            top:'76px',
                            width: '100%'
                        }}>
                            <p>Color Recognition</p>
                            <p
                                style={{
                                    position: 'absolute',
                                    right:0,
                                    top:0,
                                    fontWeight:'bold',
                                    color: this.props.improved['color_recognition'] ? '#03a9f4':'#999999'
                                }}
                            >{this.props.improved['color_recognition'] ? 'Improved': 'Needs Practice'}</p>
                        </div>
                        <div style={{
                            top:'92px',
                            width: '100%'
                        }}>
                            <p>Categorization</p>
                            <p
                                style={{
                                    position: 'absolute',
                                    right:0,
                                    top:0,
                                    fontWeight:'bold',
                                    color: this.props.improved['categorization'] ? '#03a9f4':'#999999'
                                }}
                            >{this.props.improved['categorization'] ? 'Improved': 'Needs Practice'}</p>
                        </div>
                    </div>
                    <div
                        id="quiz-bottom-bar"
                        style={{top: '152px'}}>
                        <button
                            className='secondary'
                            style={{
                                position: 'absolute',
                                width: '136px',
                                left: '40px',
                                bottom: '28px'
                            }}
                            disabled="true"
                        >Review Quiz</button>
                        <button
                            className='primary'
                            style={{
                                position: 'absolute',
                                width: '136px',
                                right: '40px',
                                bottom: '28px'
                            }}
                            onClick={this.quizSelect}
                        >Done</button>
                    </div>
                </div>
            </div>
        );
    }
}

export default QuizComplete;
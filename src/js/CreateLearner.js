/**
 * Created by solomonliu on 2017-03-24.
 */
import React, {Component} from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';
import QuizSelect from './QuizSelect';
import img from '../img/add-learner.svg'
import 'bluebird';

class CreateLearner extends Component {
    constructor(props) {
        super(props);
        this.state = {
            gender: 'decline',
            sdkReady: false
        }
    }

    clickGender(event) {
        let buttonValue = event.target.value;
        this.setState(function(prevState) {
            if (buttonValue===prevState.gender) {
                return {gender:'decline'};
            } else {
                return {gender:buttonValue};
            }
        });
    }

    render() {
        let monthsOptions = Array.apply(this, new Array(12)).map(function(_, i) {
            let monthNum = ('0' + (i + 1)).substr(-2,2);
            return (
                <option value={monthNum} key={'month-' + i}>{moment.months()[i]}</option>
            );
        });
        return (
            <div style={{width: "588px", margin: "0 auto"}}>
                <h2 className='center' style={{marginTop:'63px', height:'40px'}}>Create a learner profile</h2>
                <div className='container' style={{position:'relative', margin:'103px auto 0', width: '400px', padding: '87px 94px 40px'}}>
                    <img src={img}
                         style={{position:'absolute', top: '-55px', left:'239px'}}
                         alt=""
                    />
                    <div>
                        <div className='small bold'>Learner Name*</div>
                        <input type="text" style={{width:'376px', 'marginTop': '5px'}} ref={input=>this.nameInput=input}/>
                    </div>
                    <div style={{margin:'24px 0 0'}}>
                        <div className='small bold'>Birth Month & Year</div>
                        <select style={{width:'188px', 'marginTop': '5px'}} ref={input=>this.monthInput=input}>
                            {monthsOptions}
                        </select>
                        <input type="number" style={{width:'164px', 'margin': '5px 0 0 24px'}} ref={input=>this.yearInput=input}/>
                    </div>
                    <div style={{margin:'24px 0 0'}}>
                        <div className='small bold'>Gender</div>
                        <button
                            value="male"
                            className={"secondary " + (this.state.gender === 'male' ? 'active' : '')}
                            style={{width:'200px', 'marginTop': '5px'}}
                            onClick={this.clickGender.bind(this)}
                        >Boy</button>
                        <button
                            value="female"
                            className={"secondary " + (this.state.gender === 'female' ? 'active' : '')}
                            style={{width:'200px', 'marginTop': '5px'}}
                            onClick={this.clickGender.bind(this)}
                        >Girl</button>
                    </div>
                    <button disabled={!this.state.sdkReady} className="primary" style={{width:'220px', margin:'40px auto 0', display:"block"}} onClick={this.create.bind(this)}>Create</button>
                </div>
            </div>
        );
    }

    create() {
        this.setState({sdkReady:false});
        let p = Promise.resolve(null);
        if (!window.sdk.getCurrentUser()) {
            p = window.sdk.createUser('demo' + Date.now() + '@kidaptive.com',
                btoa(String.fromCharCode.apply(this, crypto.getRandomValues(new Uint8Array(33)))),
                'Demo User'
            );
        }
        p.then(function() {
            return window.sdk.createLearner(
                this.nameInput.value,
                this.yearInput.value ? new Date(this.yearInput.value + "-" + this.monthInput.value + "-01") : null,
                this.state.gender
            )
        }.bind(this)).then(function() {
            ReactDOM.render(
                <QuizSelect/>,
                document.getElementById('root')
            )
        }, function(error) {
            alert("error creating Learner: " + error);
            this.setState({sdkReady: true});
        }.bind(this));
    };
}

export default CreateLearner;
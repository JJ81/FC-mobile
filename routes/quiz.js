var express = require('express');
var router = express.Router();
var mysql_dbc = require('../commons/db_conn')();
var connection = mysql_dbc.init();
var QUERY = require('../database/query');
var isAuthenticated = function (req, res, next) {
  if (req.isAuthenticated())
    return next();
  res.redirect('/login');
};
require('../commons/helpers');
var async = require('async');

// 퀴즈 정답확인12
// JSON.parse 는 string 개체를 JSON 개체로, JSON.stringify 는 JSON 개체를 string 로 변환한다.
router.post('/log/checkanswer', isAuthenticated, function (req, res) {

  var inputs = req.body.data;
  // console.log(inputs);

  // quiz_id 를 SELECT IN Parameter 로 생성한다. ex. (1, 2)
  var quiz_ids = inputs.map(function(input) { return parseInt(input.quiz_id); });
  var query = connection.query(QUERY.COURSE_LIST.SEL_QUIZ_2, [
        [quiz_ids]
      ], 
      function (err, data) {
        // console.log(query.sql);
        if (err) {
          // 쿼리 실패
          return res.json({
            success: false,
            msg: err
          });
        } else {     
          // 쿼리 성공
          // 정답확인 및 결과전송, 로그 입력
          // 교육과정 기간동안만 쌓는다

          // res 반환값
          var results = [], // 반환할 결과값
              user_quiz = null, // 사용자가 입력한 퀴즈 정보
              user_answer = null, // 사용자가 입력한 답안
              data_quiz = null, // DB 에서 조회한 퀴즈 정보
              quiz_start_index = 0, // 첫번째 퀴즈
              quiz_end_index = data.length - 1; // 마지막퀴즈                   

          // async 시작
          async.whilst(
            function () {
              return quiz_start_index <= quiz_end_index; 
            },
            function (callback) {          
              // 사용자가 입력한 퀴즈 정보를 임시저장
              user_quiz = inputs[quiz_start_index];
              data_quiz = data[quiz_start_index];

              // console.log('user_quiz : ' + user_quiz);
              // console.log('data_quiz : ' + data_quiz);
              
              if (user_quiz.answer_column === 'answer_desc') {

                // 단답형
                results.push({
                  quiz_id: user_quiz.quiz_id,              
                  correct_answer: data_quiz.answer_desc,
                  iscorrect: (user_quiz.answer === data_quiz.answer_desc), // 정답확인
                  answer_column: user_quiz.answer_column
                });

              } else {
                // 다지선다형 
                var result = {
                  quiz_id: user_quiz.quiz_id,         
                  correct_answer: data_quiz.answer, // id 로 넘어온다
                  iscorrect: true,
                  answer_column: user_quiz.answer_column
                };                    

                // 정답여부 체크                
                user_quiz.answer_ids = JSON.parse("[" + user_quiz.answer_ids + "]");   
                data_quiz.answer = JSON.parse("[" + data_quiz.answer + "]");                         
                
                // console.log('quiz_id : ' + user_quiz.quiz_id);
                // console.log(user_quiz.answer_ids);
                // console.log(data_quiz.answer);

                if (user_quiz.answer_ids.length !== data_quiz.answer.length || !data_quiz.answer.length || !user_quiz.answer_ids.length)
                  result.iscorrect = false;
                else {
                  for (var i = 0; i < data_quiz.answer.length; i++) {
                    for (var j = 0; j < user_quiz.answer_ids.length; j++) {
                      // console.log('answer1 : ' + data_quiz.answer[i]);
                      // console.log('answer2 : ' + user_quiz.answer_ids[j]);

                      if (user_quiz.answer_ids[j] !== data_quiz.answer[i])     
                        result.iscorrect = false;
                      else {
                        result.iscorrect = true;
                        break;
                      }
                        
                    }

                    if (!result.iscorrect) 
                      break;
                  }
                }

                // 옵션명 조회
                var query = connection.query(QUERY.COURSE_LIST.SEL_OPTION, [
                    [JSON.parse("[" + data_quiz.answer + "]")]
                  ], 
                  function (err, option_names) {
                    // //console.log(query.sql);
                    if (err) {
                      //console.log('옵션명 조회 시 오류 발생::');
                      //console.log(err);
                    } else {
                      //console.log('옵션명 조회::');
                      //console.log(results1[0].correct_answer);                       
                      result.correct_answer = option_names[0].correct_answer; // ex. 보기1, 보기2                         
                    }
                  }
                );

                // console.log(result);

                results.push(result);
              } // endif

              quiz_start_index++;
              callback(err, result);

            },
            function (err, data) {
              if (err) {            
                //console.log('정답확인시 오류발생');
                //console.log(err);
              } else {
                //console.log('정답확인완료!');
              }
            }
          );

          //console.log('중간결과');
          //console.log(results);

          // 로그(log_user_quiz) 입력   
          //console.log('로그입력시작!');   
          connection.beginTransaction(function(err) {

            // 트렌젝션 오류 발생
            if (err) { 
              return res.json({
                success: false,
                msg: err
              });
            }

            quiz_start_index = 0;
            quiz_end_index = results.length - 1;

            async.whilst (
              function () {
                return quiz_start_index <= quiz_end_index;
              },
              function (callback) {
                
                // 사용자 입력 퀴즈 정보
                user_quiz = inputs[quiz_start_index];

                // 선택형 또는 다지선다형일 경우
                // if (user_quiz.answer_column !== 'answer_desc')
                //   user_quiz.answer = user_quiz.answer_names.join(',');
                
                // 퀴즈별로 로그를 입력한다.
                var query = connection.query(QUERY.LOG_QUIZ.INS_QUIZ, [
                    req.user.user_id,
                    parseInt(user_quiz.quiz_id),
                    user_quiz.answer !== undefined ? user_quiz.answer : user_quiz.answer_names, // 사용자입력단안
                    results[quiz_start_index].iscorrect ? 1 : 0, // 정답여부
                    req.user.user_id,
                    parseInt(user_quiz.quiz_id)
                  ],
                  function (err, data) {
                    // //console.log(query.sql);
                    quiz_start_index++;
                    callback(err, data);
                  });
              },
              function (err, data) {
                if (err) {
                  // 쿼리 오류
                  return connection.rollback(function() {
                    //console.log('쿼리오류발생!');
                    //console.log(err);
                  });              
                } else {
                  connection.commit(function(err) {
                    // 커밋 오류
                    if (err) {
                      return connection.rollback(function() {
                        //console.log('커밋오류발생!');
                        //console.log(err);
                      });
                    } else {
                      //console.log('로그입력종료!');   
                    }                   
                  });
                }
              }
            );

            // //console.log(results);

            res.json({
              'success': true,
              'msg': '성공!',
              'results': results
            });        
            
          });
        }
      }
    );
});

module.exports = router;
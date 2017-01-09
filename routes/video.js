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

// 비디오 환경설정값을 리턴한다.
router.get('/settings', function (req, res) {
  return res.json({
    success: true,
    interval: 5
  });
});

// url: /api/v1/log/video/playtime 
// 비디오 재생시간(play_seconds, 재생중 매 1분마다) 기록
router.post('/log/playtime', function (req, res) {
    
  var inputs = {
        user_id: req.user.user_id,
        video_id: parseInt(req.body.video_id),
        played_seconds: parseInt(req.body.timer_played_seconds)
      },
      log_id = null, // log_user_video 테이블의 id
      total_played_seconds = null; // 총 재생시간

  connection.beginTransaction(function(err) {

    // 트렌젝션 오류 발생
    if (err) { 
      res.json({
        success: false,
        msg: err
      });
    }

    // async.series 쿼리 시작
    async.series([
      function (callback) {
        // 오늘일자의 로그가 없을 경우 생성 
        var query = connection.query(QUERY.LOG_VIDEO.INS_VIDEO, [
            inputs.user_id,
            inputs.video_id,
            inputs.user_id,
            inputs.video_id
          ], 
          function (err, data) {
            // console.log(query.sql);
            callback(err, data);
          }
        );
      },
      function (callback) {
        // log id를 구한다.
        var query = connection.query(QUERY.LOG_VIDEO.SEL_MAXID, [
            inputs.user_id,
            inputs.video_id        
          ], function (err, data) {
            //console.log(query.sql);
            log_id = data[0].id;
            callback(err, data);
          });
      },
      function (callback) {
        // 재생시간을 수정한다.
        var query = connection.query(QUERY.LOG_VIDEO.UPD_VIDEO_PLAYTIME, [
            inputs.played_seconds, 
            log_id
          ], 
          function (err, data) {
            //console.log(query.sql);
            callback(err, data);
          }
        );
      },
      function (callback) {
        // 재생시간을 조회한다.
        var query = connection.query(QUERY.LOG_VIDEO.SEL_TOTAL_VIDEO_PLAYTIME, [
            inputs.user_id,
            inputs.video_id        
          ], function (err, data) {
            //console.log(query.sql);
            total_played_seconds = data[0].total_played_seconds;
            callback(err, data);
          });
      },      
    ],
    // async endpoint
    function (err, results) {
      if (err) {
        // 쿼리 오류 발생
        return connection.rollback(function() {
          //console.log('rollback');
          res.json({
            success: false,
            msg: err
          });
        });
      } else {
        connection.commit(function(err) {
          // 커밋 오류 발생
          if (err) {
            return connection.rollback(function() {
              //console.log('comiit rollback');              
              res.json({
                success: false,
                msg: err
              });
            });
          }
          // 커밋 성공
          //console.log('commit success');
          res.json({
            success: true,
            total_played_seconds: total_played_seconds
          });
        });
      }
    });  

  });    
  
});

// url: /api/v1/log/video/endtime 
// 아래의 경우, 비디오 종료시간을 기록한다. 
// 1. 일시정지 
// 2. 영상이 끝났을 때 
// 3. 재생 중 다음으로 넘어가는 경우
router.post('/log/endtime', function (req, res) {
  
  var inputs = {
        user_id: req.user.user_id,
        video_id: req.body.video_id
      }, 
      log_id = null; // log_user_video 테이블의 id

  connection.beginTransaction(function(err) {

    // 트렌젝션 오류 발생
    if (err) { 
      return res.json({
        success: false,
        msg: err
      });
    }

    // async.series 쿼리 시작
    async.series([
      function (callback) {
        // 오늘일자의 로그가 없을 경우 생성 
        connection.query(QUERY.LOG_VIDEO.INS_VIDEO, [
            inputs.user_id,
            inputs.video_id,
            inputs.user_id,
            inputs.video_id
          ], 
          function (err, data) {
            callback(err, data);
          }
        );
      },
      function (callback) {
        // log id를 구한다.
        var query = connection.query(QUERY.LOG_VIDEO.SEL_MAXID, [
            inputs.user_id,
            inputs.video_id        
          ], function (err, data) {
            //console.log(query.sql);
            log_id = data[0].id;
            callback(err, data);
          });
      },    
      function (callback) {
        // 종료일시를 수정한다.
        var query = connection.query(QUERY.LOG_VIDEO.UPD_VIDEO_ENDTIME, [  
            log_id
          ], 
          function (err, data) {
            //console.log(query.sql);
            callback(err, data);
          }
        );
      }
    ], 
    function (err, results) {
      if (err) {

        // 쿼리 오류 발생
        return connection.rollback(function() {
          res.json({
            success: false,
            msg: err
          });
        });
      } else {
        connection.commit(function(err) {
          // 커밋 오류 발생
          if (err) {
            return connection.rollback(function() {
              res.json({
                success: false,
                msg: err
              });
            });
          }

          // 커밋 성공
          res.json({
            success: true
          });
        });
      }
    });  
  });      
  
});

module.exports = router;
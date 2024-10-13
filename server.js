const express = require('express');
const mysql = require('mysql');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();

// 데이터베이스 옵션 설정
var options = {
  host: 'localhost',
  user: 'root',
  password: '1019',
  database: 'user'
};

// 세션 저장소 설정
var sessionStore = new MySQLStore(options);

app.use(session({
  secret: 'my key',
  resave: false,
  saveUninitialized: true,
  store: sessionStore
}));

// MySQL 데이터베이스 연결 설정
const connection = mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '1019',
  database: process.env.DB_NAME || 'user',
  port: process.env.DB_PORT || '3306',
});


// 정적 파일 설정
app.use(express.static(path.join(__dirname, 'public')));

// 요청 데이터 파싱 설정
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// EJS 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


// 서버 시작 시 데이터베이스 연결
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  connection.connect();
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});

// 라우팅 설정

// 메인 페이지
app.get('/', function(req, res) {
  res.render('mainpage.ejs', { session: req.session });
});

// 로그인 페이지
app.get('/login', (req, res) => {
  res.render('login.ejs', { session: req.session });
});

// 회원가입 페이지
app.get('/regist', (req, res) => {
  res.render('regist.ejs', { session: req.session });
});

// 회원가입 처리
app.post('/regist', (req, res) => {
  const { id, pw, name, phone, email } = req.body;
  connection.query('select * from user.user_tb where userid=?', [id], (err, data) => {
    if (data.length == 0) {
      connection.query('insert into user.user_tb(userid, name, phone, password, email) values(?,?,?,?,?)', [id, name, phone, pw, email], (err, result) => {
        if (err) throw err;
        res.send("<script>alert('회원가입하셨습니다. 다시 로그인하세요');location.href='/login';</script>");
      });
    } else {
      res.redirect('/login');
    }
  });
});

// 로그인 처리
app.post('/login', (req, res) => {
  const { id, pw } = req.body; // 사용자가 입력한 id와 pw를 req.body에서 가져옴
  connection.query('select * from user.user_tb where userid=? and password=?', [id, pw], (err, rows) => {
    if (err) throw err; // 에러가 발생하면 에러를 던짐
    if (rows.length) { // rows.length가 존재하면, 즉 유효한 사용자임을 확인
      req.session.isLogined = true; // 로그인 상태를 true로 설정
      req.session.uid = id; // 사용자 id를 세션에 저장
      req.session.save(() => {
        res.redirect('/newpage'); // 세션이 저장된 후 newpage로 리디렉션
      });
    } else {
      res.redirect('/login'); // 로그인 실패 시 로그인 페이지로 다시 이동
    }
  });
});

// 로그인된 사용자 전용 페이지
app.get('/newpage', (req, res) => {
  if (req.session.isLogined) {
    // 사용자가 로그인된 상태라면 newpage.ejs를 렌더링
    res.render('newpage.ejs', { session: req.session });
  } else {
    // 로그인되지 않은 상태라면 로그인 페이지로 리디렉션
    res.redirect('/login');
  }
});

// 로그아웃
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// 마이페이지 접근
app.get('/mypage', logincheck, (req, res) => {
  const userId = req.session.uid;

  // 현재 로그인된 사용자의 정보를 가져오기
  connection.query('SELECT * FROM user.user_tb WHERE userid = ?', [userId], (err, userRows) => {
    if (err) {
      console.error('Error while fetching user information:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    if (userRows.length) {
      // 현재 사용자가 좋아요를 누른 영화 목록을 가져오기
      connection.query(`
        SELECT movies.* FROM movies
        JOIN user_likes ON movies.id = user_likes.movie_id
        WHERE user_likes.user_id = ?
      `, [userId], (err, likedMoviesRows) => {
        if (err) {
          console.error('Error while fetching liked movies:', err);
          res.status(500).send('Internal Server Error');
          return;
        }

        // 사용자 정보와 좋아요 영화 목록을 mypage.ejs로 렌더링
        res.render('mypage', { user: userRows[0], likedMovies: likedMoviesRows, session: req.session });
      });
    } else {
      res.redirect('/login');
    }
  });
});


// 개인정보 수정 페이지
app.get('/mymodify', logincheck, (req, res) => {
  res.render('mymodify', { session: req.session });
});

// 개인정보 수정 처리
app.post('/mymodify', logincheck, (req, res) => {
  const { name, pw, phone, email } = req.body;
  connection.query('UPDATE user.user_tb SET name=?, password=?, phone=?, email=? WHERE userid=?', [name, pw, phone, email, req.session.uid], (err, result) => {
    if (err) throw err;
    res.redirect('/newpage');
  });
});

// 영화 목록 페이지
app.get('/movies', (req, res) => {
  let page = parseInt(req.query.page) || 1;
  let limit = 50;
  let offset = (page - 1) * limit;

  connection.query('SELECT id, title, vote_average, status, release_year, Director, Poster_Link, overview, genres_list FROM movies LIMIT ? OFFSET ?', [limit, offset], (err, rows) => {
    if (err) {
      console.error('Error while fetching movies:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    connection.query('SELECT COUNT(*) AS count FROM movies', (err, countRows) => {
      if (err) {
        console.error('Error while counting movies:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      let totalMovies = countRows[0].count;
      let totalPages = Math.ceil(totalMovies / limit);

      // `query`를 `null`로 설정하여 전달
      res.render('movies.ejs', { movies: rows, currentPage: page, totalPages: totalPages, session: req.session, query: null });
    });
  });
});


// 영화 검색 기능 (페이지네이션 포함)
app.get('/movies/search', (req, res) => {
  const query = req.query.query;
  const searchQuery = `%${query}%`; // 부분 일치를 위해 양쪽에 % 추가

  let page = parseInt(req.query.page) || 1; // 현재 페이지, 기본값은 1
  let limit = 50; // 한 페이지에 표시할 영화 수
  let offset = (page - 1) * limit; // 오프셋 계산

  // 검색된 영화 개수 가져오기
  let countSql = `
    SELECT COUNT(*) AS count FROM movies
    WHERE title LIKE ? OR Director LIKE ? OR Star1 LIKE ? OR Star2 LIKE ? OR Star3 LIKE ? OR Star4 LIKE ?
  `;

  // 검색된 영화 목록 가져오기
  let sql = `
    SELECT * FROM movies
    WHERE title LIKE ? OR Director LIKE ? OR Star1 LIKE ? OR Star2 LIKE ? OR Star3 LIKE ? OR Star4 LIKE ?
    LIMIT ? OFFSET ?
  `;

  // 영화 총 개수 쿼리 실행
  connection.query(countSql, [searchQuery, searchQuery, searchQuery, searchQuery, searchQuery, searchQuery], (err, countRows) => {
    if (err) {
      console.error('Error while counting movies:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    let totalMovies = countRows[0].count;
    let totalPages = Math.ceil(totalMovies / limit);

    // 영화 검색 결과 쿼리 실행
    connection.query(sql, [searchQuery, searchQuery, searchQuery, searchQuery, searchQuery, searchQuery, limit, offset], (err, rows) => {
      if (err) {
        console.error('Error while searching movies:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      // 검색 결과와 함께 렌더링
      res.render('movies.ejs', { movies: rows, session: req.session, currentPage: page, totalPages: totalPages, query: query });
    });
  });
});

// 좋아요를 처리하는 라우트 (AJAX 요청 처리)
app.post('/movies/like', (req, res) => {
  if (!req.session.isLogined) {
    return res.status(401).json({ success: false, message: 'You must be logged in to like a movie.' });
  }

  const movieId = req.body.movieId;
  const userId = req.session.uid;

  // 먼저 좋아요를 했는지 확인하기
  connection.query('SELECT * FROM user_likes WHERE user_id = ? AND movie_id = ?', [userId, movieId], (err, rows) => {
    if (err) {
      console.error('Error while checking likes:', err);
      return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }

    if (rows.length > 0) {
      // 이미 좋아요한 영화인 경우
      return res.json({ success: false, message: 'Already liked this movie' });
    }

    // 좋아요 추가 쿼리
    connection.query('INSERT INTO user_likes (user_id, movie_id) VALUES (?, ?)', [userId, movieId], (err, result) => {
      if (err) {
        console.error('Error while updating likes:', err);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
      }
      res.json({ success: true });
    });
  });
});

app.post('/movies/filter', (req, res) => {
  const { genres, year } = req.body;
  const page = parseInt(req.query.page) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;

  let query = `SELECT * FROM movies WHERE 1=1`;
  let queryParams = [];

  // 각 선택한 장르를 모두 포함하는 영화를 찾기 위해 AND 조건을 추가
  if (genres && genres.length > 0) {
    genres.forEach(genre => {
      query += ` AND genres_list LIKE ?`;
      queryParams.push(`%${genre}%`);
    });
  }

  if (year) {
    query += ` AND release_year = ?`;
    queryParams.push(year);
  }

  query += ` LIMIT ? OFFSET ?`;
  queryParams.push(limit, offset);

  connection.query(query, queryParams, (err, rows) => {
    if (err) {
      console.error('Error while filtering movies:', err);
      return res.status(500).json({ success: false, message: 'Error filtering movies' });
    }

    // 필터링된 영화와 전체 페이지 수 계산
    connection.query('SELECT COUNT(*) AS count FROM movies WHERE 1=1', (err, countResult) => {
      if (err) {
        console.error('Error counting movies:', err);
        return res.status(500).json({ success: false, message: 'Error counting movies' });
      }

      const totalMovies = countResult[0].count;
      const totalPages = Math.ceil(totalMovies / limit);

      res.json({ success: true, movies: rows, totalPages });
    });
  });
});


app.get('/get-year-data', (req, res) => {
  const yearQuery = `SELECT release_year, COUNT(*) AS count FROM movies GROUP BY release_year`;

  connection.query(yearQuery, (err, yearResults) => {
      if (err) {
          console.error('Error fetching year data:', err);
          return res.status(500).json({ error: 'Failed to fetch year data' });
      }

      const yearData = yearResults.map(row => ({
          year: row.release_year,
          count: row.count
      }));

      console.log("Sending year data:", yearData);  // 서버에서 클라이언트로 보낼 데이터 확인
      res.json(yearData);  // 클라이언트로 yearData 전송
  });
});

app.get('/get-genre-data', (req, res) => {
  const query = `SELECT genres_list FROM movies`;

  connection.query(query, (err, results) => {
      if (err) {
          console.error('Error fetching genre data:', err);
          return res.status(500).send('Error fetching genre data');
      }

      // 장르를 개별적으로 분리하고, 카운트
      const genreCount = {};
      results.forEach(row => {
          const genres = row.genres_list.split(','); // 쉼표로 구분된 장르 분리
          genres.forEach(genre => {
              genre = genre.trim().replace(/[\[\]']+/g,'');  // 공백 및 대괄호 제거
              if (genreCount[genre]) {
                  genreCount[genre]++;
              } else {
                  genreCount[genre] = 1;
              }
          });
      });

      // 장르 카운트 데이터를 배열로 변환
      const genreData = Object.entries(genreCount).map(([name, count]) => ({ name, count }));

      res.json(genreData);  // 클라이언트에 데이터 전송
  });
});


app.get('/get-top-genres-data', (req, res) => {
  const query = `SELECT genres_list FROM movies`;

  connection.query(query, (err, results) => {
      if (err) {
          console.error('Error fetching genre data:', err);
          return res.status(500).send('Error fetching genre data');
      }

      // 장르를 개별적으로 분리하고 카운트
      const genreCount = {};
      results.forEach(row => {
          const genres = row.genres_list.split(','); // 쉼표로 구분된 장르 분리
          genres.forEach(genre => {
              genre = genre.trim().replace(/[\[\]']+/g,'');  // 공백 및 대괄호 제거
              if (genreCount[genre]) {
                  genreCount[genre]++;
              } else {
                  genreCount[genre] = 1;
              }
          });
      });

      // 상위 10개 장르 추출
      const sortedGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const genreData = sortedGenres.map(([name, count]) => ({ name, count }));

      res.json(genreData);  // 클라이언트에 데이터 전송
  });
});

// 좋아요 목록에서 영화를 삭제하는 라우트
app.post('/movies/delete', (req, res) => {
  if (!req.session.isLogined) {
      return res.status(401).json({ success: false, message: 'You must be logged in to remove a movie.' });
  }

  const movieId = req.body.movieId;
  const userId = req.session.uid;

  // 좋아요에서 해당 영화를 삭제하는 쿼리
  connection.query('DELETE FROM user_likes WHERE user_id = ? AND movie_id = ?', [userId, movieId], (err, result) => {
      if (err) {
          console.error('Error while deleting liked movie:', err);
          return res.status(500).json({ success: false, message: 'Internal Server Error' });
      }

      res.json({ success: true });
  });
});






// 로그인 여부 확인 미들웨어
function logincheck(req, res, next) {
  if (req.session && req.session.isLogined) {
    next();
  } else {
    res.redirect('/login');
  }
}

const uuidv4 = require('uuid/v4');
const crypto = require('crypto');
const fs = require('fs');
const request = require('request-promise');

const config = require('../config');

const j = request.jar();

class InstagramApi {
  constructor (session) {
    if (session) {
      this.setSession(session);
    }
    this.mediaImage = [];
    this.followerList = {
      total: 0,
      data: [],
    };
    this.followingList = {
      total: 0,
      data: [],
    };
    this.userId = '';
    this.count = 0;
  }

  async getProfile (username) {
    let data = await this.fetchApi(config.GRAPHQL_URL.checkProfile(username), 'GET');
    return data;
  }

  async getTimelineStory () {
    let { data } = await this.fetchApi(config.GRAPHQL_URL.storyTimeline, 'GET');
    return data.user.feed_reels_tray.edge_reels_tray_to_reel.edges.map(v => {
      return {
        isUserHasView: v.node.seen === v.node.latest_reel_media || v.node.seen > v.node.latest_reel_media,
        username: v.node.user.username,
      };
    });
  }

  async uploadStory (path) {
    const uploadID = new Date().getTime();
    let result = await this.configurePhoto(path, uploadID);
    if (result.status === 'ok') {
      let configure = await this.fetchApi('create/configure_to_story/', 'POST', {
        upload_id: uploadID,
        caption: '',
      });
      return configure;
    }
    return { success: false, message: 'something error' };
  }

  async uploadPhoto (path, caption) {
    const uploadID = new Date().getTime();
    let result = await this.configurePhoto(path, uploadID);
    if (result.status === 'ok') {
      let configure = await this.fetchApi('create/configure/', 'POST', {
        upload_id: uploadID,
        caption: caption,
      });
      return configure;
    }
    return { success: false, message: 'something error' };
  }

  async viewStory (username) {
    let story = await this.story(username);
    return story.map(async (v) => {
      let postData = {
        reelMediaId: v.reelMediaId,
        reelMediaOwnerId: v.reelMediaOwnerId,
        reelId: v.reelMediaOwnerId,
        reelMediaTakenAt: v.reelMediaTakenAt,
        viewSeenAt: v.reelMediaTakenAt,
      };

      let data = await this.fetchApi(config.GRAPHQL_URL.storySeen, 'POST', postData);
      return data;
    });
  }

  configurePhoto (path, uploadID) {
    let imageBuffer = fs.createReadStream(path);
    return this.fetchApi('create/upload/photo/', 'POST', {
      upload_id: uploadID,
      photo: {
        value: imageBuffer,
        options: {
          filename: `pending_media_${uploadID}.jpg`,
          contentType: 'image/jpeg',
        },
      },
      media_type: 1,
    }, 1);
  }

  async like (id) {
    let data = await this.fetchApi(config.GRAPHQL_URL.likeMedia(id), 'POST');
    return data;
  }

  async comment (id, code, comment) {
    let data = await this.fetchApi(config.GRAPHQL_URL.commentMedia(id), 'POST', { comment_text: comment });
    return data;
  }

  async register (email, username, password, firstName = 'demobot') {
    try {
      let response = await request({
        uri: config.BASE_URL + 'accounts/signup/email?__a=1',
        method: 'GET',
        resolveWithFullResponse: true,
      });
      let mid = response.headers['set-cookie'].join(' ').match(/(mid=.+?;)/gm)[0].slice(3, -1);
      let csrfToken = response.headers['set-cookie'].join(' ').match(/(en=.+?;)/gm)[0].slice(3, -1);

      let checkEmail = await request({
        uri: config.BASE_URL + 'accounts/check_email/',
        method: 'POST',
        headers: {
          'x-csrftoken': csrfToken,
          'content-type': 'application/x-www-form-urlencoded',
          'x-requested-with': 'XMLHttpRequest',
          'x-instagram-ajax': '1',
        },
        formData: {
          email: email,
        },
      });
      let { valid, available } = JSON.parse(checkEmail);
      setTimeout(async () => {
        if (valid && available) {
          let postRegister = await request({
            uri: config.BASE_URL + 'accounts/web_create_ajax/',
            // resolveWithFullResponse: true,
            method: 'POST',
            headers: {
              'X-CSRFToken': csrfToken,
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest',
              'X-Instagram-Ajax': '1',

            },
            formData: {
              email,
              password,
              username,
              first_name: firstName,
              client_id: mid,
              seamless_login_enabled: 1,
              tos_version: 'row',
            },
          });
          return postRegister;
        }
      }, 30000);
      return { success: false, message: 'Something error' };
    } catch (error) {
      return error.message;
    }
  }

  async getTimeLineFeed () {
    let { data } = await this.fetchApi(config.GRAPHQL_URL.timelineFeed, 'GET');
    let { edges } = data.user.edge_web_feed_timeline;
    return edges;
  }

  async follower ({ username, limit }, nextCursor = '') {
    if (!nextCursor) {
      let { graphql: { user } } = await this.getProfile(username);
      this.userId = user.id;
    }

    let { data } = await this.fetchApi(config.GRAPHQL_URL.fetchFollower(this.userId, nextCursor));
    let { count, page_info: { has_next_page, end_cursor }, edges } = data.user.edge_followed_by;

    edges.map(v => {
      this.followerList.data.push({
        idUser: v.node.id,
        username: v.node.username,
        is_private: v.node.is_private,
      });
    });

    let hasLimit = limit || count;

    if (has_next_page && this.followerList.data.length < hasLimit) {
      let nextPage = `%2C%22after%22%3A%22${end_cursor.slice(0, end_cursor.length - 2)}%3D%3D%22`;
      await this.follower({ username, limit }, nextPage);
    }

    this.followerList.total = count;
    // this.followerList.data = this.followerList.data.slice(0, hasLimit);
    return this.followerList;
  }

  async following ({ username, limit }, nextCursor = '') {
    if (!nextCursor) {
      let { graphql: { user } } = await this.getProfile(username);
      this.userId = user.id;
    }

    let { data } = await this.fetchApi(config.GRAPHQL_URL.fetchFollowing(this.userId, nextCursor));
    let { count, page_info: { has_next_page, end_cursor }, edges } = data.user.edge_follow;
    edges.map(v => {
      this.followingList.data.push({
        idUser: v.node.id,
        username: v.node.username,
        is_private: v.node.is_private,
      });
    });

    let hasLimit = limit || count;

    if (has_next_page && this.followingList.data.length < hasLimit) {
      let nextPage = `%2C%22after%22%3A%22${end_cursor.slice(0, end_cursor.length - 2)}%3D%3D%22`;
      await this.following({ username, limit }, nextPage);
    }

    this.followingList.total = count;
    // this.followingList.data = this.followingList.data.slice(0, hasLimit);
    return this.followingList;
  }

  async getUserNotFollowBack (username) {
    let peopleNotFollowBack = [];
    let follower = await this.follower({ username });
    let following = await this.following({ username });

    let dataFollowing = following.data.map(v => {
      return v.username;
    });

    let dataFollower = follower.data.map(v => {
      return v.username;
    });

    dataFollowing.map(v => {
      if (!dataFollower.includes(v)) {
        peopleNotFollowBack.push(v);
      }
    });
    return peopleNotFollowBack;
  }

  async getMediaByUsername (username, countImage = 2) {
    let { graphql: { user } } = await this.fetchApi(config.GRAPHQL_URL.checkProfile(username), 'GET');
    let {
      edges: nodes,
      page_info,
    } = user.edge_owner_to_timeline_media;
    for (let i = 0; i < nodes.length; i++) {
      this.mediaImage.push({
        id: nodes[i].node.id,
        code: (!nodes[i].node.comments_disabled) ? nodes[i].node.shortcode : null,
        src: nodes[i].node.display_url,
        comments_disabled: nodes[i].node.comments_disabled,
      });
    }
    let data = await this._pageMediaByUserName(page_info.end_cursor, user, Math.floor(countImage / 12) - 1);
    return data.slice(0, countImage);
  }

  async _pageMediaByUserName (nextCursor, idUser, countImage) {
    if (nextCursor) {
      let response = await this.fetchApi(config.GRAPHQL_URL.pagingMedia(idUser.id, nextCursor));
      let {
        page_info,
        edges,
      } = response.data.user.edge_owner_to_timeline_media;
      for (let i = 0; i < edges.length; i++) {
        this.mediaImage.push({
          id: edges[i].node.id,
          code: (!edges[i].node.comments_disabled) ? edges[i].node.shortcode : null,
          src: edges[i].node.display_url,
          comments_disabled: edges[i].node.comments_disabled,
        });
      }

      if (countImage < 1) {
        return this.mediaImage;
      }

      if (page_info.has_next_page) {
        countImage -= 1;
        let data = await this._pageMediaByUserName(page_info.end_cursor, idUser, countImage);
        return data;
      }
    }
    return this.mediaImage;
  }

  async story (username) {
    const dataUrl = [];
    let response = await this.getProfile(username);
    let { data } = await this.fetchApi(config.GRAPHQL_URL.storyByUserId(response.graphql.user.id), 'GET');
    if (data.reels_media.length > 0) {
      let { items } = data.reels_media[0];
      for (let i = 0; i < items.length; i++) {
        let resources = items[i].is_video ? 'video_resources' : 'display_resources';
        dataUrl.push({
          reelMediaId: items[i].id,
          latestReelMedia: data.reels_media[0].latest_reel_media,
          reelMediaOwnerId: items[i].owner.id,
          reelMediaTakenAt: items[i].taken_at_timestamp,
          media: items[i][resources][items[i][resources].length - 1].src,
        });
      }
      return dataUrl;
    }
  }

  async fetchApi (url, method, body, upload) {
    let headers = {
      'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Connection': 'close',
      'Accept': '*/*',
      'Cookie2': '$Version=1',
      'Accept-Language': 'en-US',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.89 Safari/537.36',
    };

    if (method === 'POST') {
      Object.assign(headers, {
        'Content-type': upload ? `multipart/form-data; boundary=${this.uuid}` : 'application/x-www-form-urlencoded',
        'x-requested-with': 'XMLHttpRequest',
        'x-instagram-ajax': '1',
        'x-csrftoken': this.xCsrfToken,
      });
    };

    const options = {
      uri: config.BASE_URL + url,
      method,
      jar: j,
      timeout: 15000,
      headers: {
        ...headers,
      },
    };

    if (body) {
      Object.assign(options, { formData: body });
    }
    try {
      let response = await request(options);
      return JSON.parse(response);
    } catch (error) {
      if (error.code === 'ETIMEDOUT') {
        console.error('TimeOut !!');
      }
      return error.code;
    }
  }

  generateSignature (data) {
    let cr = crypto.createHmac('sha1', config.IG_SIG_KEY).update(data).digest('hex');
    return 'ig_sig_key_version=' + config.SIG_KEY_VERSION + '&signed_body=' + cr + '.' + encodeURI(data);
  }

  generateUUID () {
    return uuidv4().replace(/-/g, '');
  }

  generateDeviceID (seed) {
    let volatileSeed = '12345';
    const enc = crypto.createHash('md5').update(seed + volatileSeed).digest('hex');
    return 'android-' + enc.substr(0, 16);
  }

  async login (username, password) {
    this.username = username;
    this.password = password;
    const enc = crypto.createHash('md5').update(this.username + this.password).digest('hex');

    this.device_id = this.generateDeviceID(enc);
    this.uuid = this.generateUUID();

    await this.sendRequest('si/fetch_headers/?challenge_type=signup&guid=' + this.generateUUID(), 'GET');
    let data = {
      'phone_id': this.generateUUID(),
      '_csrftoken': this.csrfToken,
      'username': this.username,
      'guid': this.uuid,
      'device_id': this.device_id,
      'password': this.password,
      'login_attempt_count': '0',
    };
    let signature = this.generateSignature(JSON.stringify(data));
    let result = await this.sendRequest('accounts/login/', 'POST', signature);
    return result;
  }

  setSession (session) {
    let url = 'https://www.instagram.com';
    session.session.map((v) => {
      let cookie = request.cookie(v);
      j.setCookie(cookie, url);
    });
    this.jars = j;
    this.uuid = session._uuid;
    this.xCsrfToken = session.csrfToken;
    this.username_id = session._uid;
    this.xToken = session._csrftoken;
  }

  async sendRequest (endpoint, method, body) {
    let options = {
      uri: config.API_URL + endpoint,
      headers: {
        'Connection': 'close',
        'Accept': '*/*',
        'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie2': '$Version=1',
        'Accept-Language': 'en-US',
        'User-Agent': config.USER_AGENT,
      },
      method,
      resolveWithFullResponse: true,
    };

    if (body) {
      Object.assign(options, {
        body,
        json: true,
      });
    }

    if (this.xToken) {
      Object.assign(options, {
        jar: this.jars,
      });
    }

    try {
      let response = await request(options);
      if (response.statusCode === 200) {
        this.csrfToken = response.headers['set-cookie'].join(' ').match(/(en=.+?;)/gm)[0].slice(3, -1);
        this.responseJson = response.body;
        if (this.responseJson.logged_in_user) {
          this.xToken = this.csrfToken;
          let saveCredentials = {
            _uuid: this.uuid,
            _uid: this.responseJson.logged_in_user.pk,
            id: this.responseJson.logged_in_user.pk,
            _csrftoken: this.xToken,
            session: response.headers['set-cookie'],
          };
          let pathLocation = require('path').resolve() + '/user.json';
          let sIdx = saveCredentials.session.findIndex((v) => /session/.test(v));
          let tIdx = saveCredentials.session.findIndex((v) => /csrftoken/.test(v));
          const userCredential = {
            sessionID: saveCredentials.session[sIdx].slice('sessionid='.length),
            csrfToken: saveCredentials.session[tIdx].split(';')[0].split('=').pop(),
          };
          const newCredential = Object.assign({}, userCredential, saveCredentials);
          fs.writeFileSync(pathLocation, JSON.stringify(newCredential, null, 2));
          console.info(`=>> data credential save on ${pathLocation}`);
          this.setSession(newCredential);
          return this;
        }
        return response.body;
      }
    } catch (error) {
      console.error({
        uri: error.options.uri,
        message: error.message,
      });
    }
  }
}

module.exports = InstagramApi;

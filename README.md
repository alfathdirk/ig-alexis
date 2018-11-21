## Preview
![image](https://i.imgur.com/oyh1lxM.gif)

## How to work with alexis
```bash
npm i alexis
```

### Login IG alexis

```javascript
let Instagram = require('alexis');


/* Or login by session */
let session = JSON.parse(fs.readFileSync(require('path').resolve() + '/user.json', 'utf8'));
const ig = new Instagram(session);
 
    
```

### Actions
```javascript

  let ig = new Ig();
  (async() => {
    /* login */
     let session = await ig.login('your uname', 'your password')

    /* get your tl media */
      let x = await session.getTimeLineFeed();
    /* end of get */
    
    
    /* get your tl user stories */
      let x = await session.getTimelineStory();
    /* end of get */
    
    /* get MediaByUserName */
      let x = await session.getMediaByUsername('alfathdirk',  24); //limit 24
    /* end of get */
    
    /* like media */
      session.like('1617391803554904915');
    /* end like media */
    
    /* for comment */
      let ob = {
          id: '860417844570038475',
          code: 'vw0XiQASDLAOyz7qynA06nBTTARSd2hiesmWE0' ,
        }
      session.comment(...ob, 'test');
    /* end comment */
    
    /* get story  */
      let x = await session.story('alfathdirk')
    /* end story  */
    
      let x = await session.viewStory('alfathdirk');
      
      //upload photo
      let x = await session.uploadPhoto(require('path').resolve(__dirname)+ '/e30.jpg','comment');

    })()

```

## Author
@alfathdirk

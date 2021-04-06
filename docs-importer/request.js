const fetch = require('node-fetch');
const { URLSearchParams } = require('url');

let COOKIES = '';

const parseCookies = response => { 
  const raw = response.headers.raw()["set-cookie"];
  console.log('parsing Cookies', raw);
  return raw.map(entry => {
    const parts = entry.split(";");
    const cookiePart = parts[0];
    return cookiePart;
  }).join(';');
}

const request = (method, url, body) => {

  let data = undefined;

  if (body !== null && body !== undefined) {
    data = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      data.append(key, value);
    }
  }

  return new Promise((resolve, reject) => {
    const options = {
      method: method.toLowerCase(),
      headers: {
        Cookie: COOKIES
      },
      body: data
    }

    console.log('requesting ' + url);
    console.log('with options: ');
    console.dir(options);

  
    fetch(url, options)
      .then(response => {
        if (!response.ok) {
          return Promise.reject({
            "status": response.status,
            "message": response.statusText
          })
        }

        if (response.status == 200) {
          let contentType = response.headers.get("content-type"); 
          if (contentType && contentType.includes("application/json")) {
            resolve(response.json())
          }
          COOKIES = parseCookies(response);
        } else {
          resolve()
        }
      })
      .catch(error => {
        reject(error);
      });
  });
}

module.exports = {
  "get": (url, body) => request("get", url, body),
  "post": (url, body) => request('post', url, body),
  "put": (url, body) => request('put', url, body)
};

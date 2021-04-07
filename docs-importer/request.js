const fetch = require("node-fetch");
const { URLSearchParams  } = require("url");
const FormData = require("form-data");

let COOKIES = "";

const parseCookies = (response) => {
    const raw = response.headers.raw()["set-cookie"];
    if (!raw) return "";
    return raw
        .map((entry) => {
            const parts = entry.split(";");
            const cookiePart = parts[0];
            return cookiePart;
        })
        .join(";");
};

const setCookie = (response) => {
  const cookie = parseCookies(response);
  if (cookie) {
    COOKIES = cookie;
  }
}

const request = (method, url, body, isFile) => {
    let data = undefined;

    if (body !== null && body !== undefined) {
      if (isFile) {
        data = new FormData();
      } else {
        data = new URLSearchParams();
      }

      for (const [key, value] of Object.entries(body)) {
        if (value && value !== undefined) {
          data.append(key, value);
        }
      }
    }


    return new Promise((resolve, reject) => {
        const options = {
            method: method.toLowerCase(),
            headers: {
                Cookie: COOKIES,
            },
            body: data,
        };

        //console.log("requesting " + url);

        fetch(url, options)
            .then((response) => {
                if (!response.ok) {
                    return Promise.reject({
                        status: response.status,
                        message: response.statusText,
                    });
                }

                if (response.status == 200) {
                    let contentType = response.headers.get("content-type");
                    if (contentType && contentType.includes("application/json")) {
                        resolve(response.json());
                    }
                    setCookie(response);
                } else {
                    resolve();
                }
            })
            .catch((error) => {
                reject(error);
            });
    });
};

module.exports = {
    get: (url, body) => request("get", url, body),
    post: (url, body) => request("post", url, body),
    put: (url, body) => request("put", url, body),
    putFile: (url, file) => request("put", url, file, true),
};

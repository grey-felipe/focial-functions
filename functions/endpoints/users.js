/* eslint-disable consistent-return */
const { admin, db } = require("../util/admin");
const config = require("../util/config");

const firebase = require("firebase");
firebase.initializeApp(config);

exports.signup = (request, response) => {
  const newUser = {
    email: request.body.email,
    password: request.body.password,
    confirm_password: request.body.confirm_password,
    user_handle: request.body.user_handle,
  };

  const noImg = "no-image.png";

  let jwtoken;

  db.doc(`users/${newUser.user_handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        return response
          .status(400)
          .json({ handle: "This handle is already taken" });
      } else {
        return firebase
          .auth()
          .createUserWithEmailAndPassword(newUser.email, newUser.password);
      }
    })
    .then((data) => {
      user_id = data.user.uid;
      return data.user.getIdToken();
    })
    .then((token) => {
      jwtoken = token;
      const credentials = {
        user_handle: newUser.user_handle,
        email: newUser.email,
        created_at: new Date().toISOString(),
        user_id,
        image_url: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
      };
      return db.doc(`users/${newUser.user_handle}`).set(credentials);
    })
    .then(() => {
      return response.status(201).json({ token: jwtoken });
    })
    .catch((err) => {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        return response.status(400).json({ email: "Email is already in use" });
      } else {
        return response.status(500).json({ error: err.message });
      }
    });
};

exports.login = (request, response) => {
  const user = {
    email: request.body.email,
    password: request.body.password,
  };

  firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then((data) => {
      return data.user.getIdToken();
    })
    .then((token) => {
      return response.json({ token });
    })
    .catch((err) => {
      return response.status(403).json({ error: err.message });
    });
};

exports.uploadImage = (request, response) => {
  const BusBoy = require("busboy");
  const path = require("path");
  const os = require("os");
  const fs = require("fs");

  let imageFilename;
  let imageForUpload = {};

  busboy = new BusBoy({ headers: request.headers });
  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    if (mimetype !== "image/jpeg" && mimetype !== "image/png") {
      return res.status(400).json({ error: "Wrong file type submitted" });
    }

    const imageExtension = filename.split(".")[filename.split(".").length - 1];
    const imageFilename = `${Math.round(
      Math.random() * 1000000
    )}.${imgExtension}`;
    const filepath = path.join(os.tmpdir(), imageFilename);
    imageForUpload = { filepath, mimetype };
    file.pipe(fs.createWriteStream(filepath));
  });
  busboy
    .on("finish", () => {
      admin
        .storage()
        .bucket()
        .upload(imageForUpload.filepath, {
          resumable: false,
          metadata: { contentType: imageForUpload.mimeType },
        });
    })
    .then(() => {
      const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFilename}?alt=media`;
      return db.doc(
        `users/${request.user.user_handle}`.update({ image_url: imageUrl })
      );
    })
    .then(() => {
      return response.json({ message: "Image uploaded successfully" });
    })
    .catch((error) => {
      return response.status(500).json({ error: error.message });
    });
  busboy.end(request.rawBody);
};

exports.addUserDetails = (request, response) => {
  db.doc(`users/${request.user.user_handle}`)
    .update(request.body)
    .then(() => {
      return response.json({ message: "Details added successfully" });
    })
    .catch((error) => {
      return response.status(500).json({ error: error.message });
    });
};

exports.getAuthenticatedUser = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.user.user_handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        userData.credentials = doc.data();
        return db
          .collection("likes")
          .where("user_handle", "==", req.user.user_handle)
          .get();
      } else {
        return [];
      }
    })
    .then((data) => {
      userData.likes = [];
      data.forEach((doc) => {
        userData.likes.push(doc.data());
      });
      return db
        .collection("notifications")
        .where("recipient", "==", req.user.user_handle)
        .orderBy("created_at", "desc")
        .limit(10)
        .get();
    })
    .then((data) => {
      userData.notifications = [];
      data.forEach((doc) => {
        userData.notifications.push({
          recipient: doc.data().recipient,
          sender: doc.data().sender,
          created_at: doc.data().created_at,
          scream_id: doc.data().scream_id,
          type: doc.data().type,
          read: doc.data().read,
          notification_id: doc.id,
        });
      });
      return res.json(userData);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.message });
    });
};

exports.getUserDetails = (request, response) => {
  let userData = {};
  db.doc(`/users/${request.params.user_handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        userData.user = doc.data();
        return db
          .collection("screams")
          .where("user_handle", "==", request.params.user_handle)
          .orderBy("created_at", "desc")
          .get();
      } else {
        return response.status(404).json({ errror: "User not found" });
      }
    })
    .then((data) => {
      userData.screams = [];
      data.forEach((doc) => {
        userData.screams.push({
          body: doc.data().body,
          created_at: doc.data().created_at,
          user_handle: doc.data().user_handle,
          image_url: doc.data().image_url,
          like_count: doc.data().like_count,
          comment_count: doc.data().comment_count,
          scream_id: doc.id,
        });
      });
      return response.json(userData);
    })
    .catch((err) => {
      return response.status(500).json({ error: err.message });
    });
};

exports.markNotificationsRead = (request, response) => {
  let batch = db.batch();
  request.body.forEach((notification_id) => {
    const notification = db.doc(`/notifications/${notification_id}`);
    batch.update(notification, { read: true });
  });
  batch
    .commit()
    .then(() => {
      return response.json({ message: "Notifications marked read" });
    })
    .catch((err) => {
      return response.status(500).json({ error: err.message });
    });
};

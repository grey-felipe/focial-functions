/* eslint-disable consistent-return */
/* eslint-disable promise/always-return */
const functions = require("firebase-functions");
const express = require("express");
const expApp = express();

const { db } = require("./util/admin");

const {
  getAllScreams,
  postScream,
  getScream,
  commentOnScream,
  likeScream,
  unLikeScream,
  deleteScream,
} = require("./endpoints/screams");

const {
  signup,
  login,
  uploadImage,
  addUserDetails,
  getAuthenticatedUser,
  getUserDetails,
  markNotificationsRead,
} = require("./endpoints/users");

const FBAuth = require("./util/middleware");

// auth routes
expApp.post("/signup", signup);
expApp.post("/login", login);

// rest of the routes
expApp.get("/screams", getAllScreams);
expApp.get("/scream/:scream_id", getScream);
expApp.post("/scream", FBAuth, postScream);
expApp.post("/scream/:scream_id/comment", FBAuth, commentOnScream);
expApp.get("/scream/:scream_id/like", FBAuth, likeScream);
expApp.get("/scream/:scream_id/unlike", FBAuth, unLikeScream);
expApp.delete("/scream/:scream_id", FBAuth, deleteScream);

// user routes
expApp.post("/user/image", FBAuth, uploadImage);
expApp.post("/user", FBAuth, addUserDetails);
expApp.get("/user", FBAuth, getAuthenticatedUser);
expApp.get("/user/:user_handle", getUserDetails);
expApp.post("/notifications", FBAuth, markNotificationsRead);

exports.api = functions.https.onRequest(expApp);

exports.createNotificationOnLike = functions.firestore
  .document("likes/{id}")
  .onCreate((snapshot) => {
    return db
      .doc(`/screams/${snapshot.data().scream_id}`)
      .get()
      .then((doc) => {
        if (
          doc.exists &&
          doc.data().user_handle !== snapshot.data().user_handle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            created_at: new Date().toISOString(),
            recipient: doc.data().user_handle,
            sender: snapshot.data().user_handle,
            type: "like",
            read: false,
            scream_id: doc.id,
          });
        }
      })
      .catch((err) => console.error(err));
  });

exports.deleteNotificationOnUnLike = functions.firestore
  .document("likes/{id}")
  .onDelete(async (snapshot) => {
    try {
      return db.doc(`/notifications/${snapshot.id}`).delete();
    } catch (err) {
      console.error(err);
      return;
    }
  });

exports.createNotificationOnComment = functions.firestore
  .document("comments/{id}")
  .onCreate((snapshot) => {
    return db
      .doc(`/screams/${snapshot.data().scream_id}`)
      .get()
      .then((doc) => {
        if (
          doc.exists &&
          doc.data().user_handle !== snapshot.data().user_handle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            created_at: new Date().toISOString(),
            recipient: doc.data().user_handle,
            sender: snapshot.data().user_handle,
            type: "comment",
            read: false,
            scream_id: doc.id,
          });
        }
      })
      .catch((err) => {
        console.error(err);
        return;
      });
  });

exports.onUserImageChange = functions.firestore
  .document("/users/{userId}")
  .onUpdate((change) => {
    console.log(change.before.data());
    console.log(change.after.data());
    if (change.before.data().image_url !== change.after.data().image_url) {
      console.log("image has changed");
      const batch = db.batch();
      return db
        .collection("screams")
        .where("user_handle", "==", change.before.data().user_handle)
        .get()
        .then((data) => {
          data.forEach((doc) => {
            const scream = db.doc(`/screams/${doc.id}`);
            batch.update(scream, { image_url: change.after.data().image_url });
          });
          return batch.commit();
        });
    } else return true;
  });

exports.onScreamDelete = functions.firestore
  .document("/screams/{screamId}")
  .onDelete((snapshot, context) => {
    const scream_id = context.params.scream_id;
    const batch = db.batch();
    return db
      .collection("comments")
      .where("scream_id", "==", scream_id)
      .get()
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/comments/${doc.id}`));
        });
        return db.collection("likes").where("scream_id", "==", scream_id).get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/likes/${doc.id}`));
        });
        return db
          .collection("notifications")
          .where("scream_id", "==", scream_id)
          .get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/notifications/${doc.id}`));
        });
        return batch.commit();
      })
      .catch((err) => console.error(err));
  });

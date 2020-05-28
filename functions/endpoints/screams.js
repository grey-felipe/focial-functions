/* eslint-disable promise/no-nesting */
const { db } = require("../util/admin");

// exports.getScreams = functions.https.onRequest((request, response) => {});
exports.getAllScreams = (request, response) => {
  db.collection("screams")
    .orderBy("created_at", "desc")
    .get()
    .then((data) => {
      let screams = [];
      data.forEach((doc) => {
        screams.push({
          scream_id: doc.id,
          body: doc.data().body,
          user_id: doc.data().user_id,
          created_at: doc.data().created_at,
          image_url: doc.data().image_url,
        });
      });
      return response.json(screams);
    })
    .catch((err) => {
      console.log(err);
    });
};

// exports.createScream = functions.https.onRequest((request, response) => {})
exports.postScream = (request, response) => {
  const newScream = {
    body: request.body.body,
    user_handle: request.user.user_handle,
    image_url: request.user.image_url,
    created_at: new Date().toISOString(),
    like_count: 0,
    comment_count: 0,
  };

  db.collection("screams")
    .add(newScream)
    .then((doc) => {
      const resScream = newScream;
      resScream.scream_id = doc.id;
      return response.status(201).json({
        scream: resScream,
      });
    })
    .catch((err) => {
      response.status(500).json({ error: err.message });
    });
};

exports.getScream = (request, response) => {
  let screamData = {};
  db.doc(`/screams/${request.params.scream_id}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return response.status(404).json({ error: "Scream not found" });
      }
      screamData = doc.data();
      screamData.scream_id = doc.id;
      return db
        .collection("comments")
        .orderBy("created_at", "desc")
        .where("scream_id", "==", request.params.scream_id)
        .get();
    })
    .then((data) => {
      screamData.comments = [];
      data.forEach((doc) => {
        screamData.comments.push(doc.data());
      });
      return response.json(screamData);
    })
    .catch((err) => {
      console.error(err);
      response.status(500).json({ error: err.message });
    });
};

exports.commentOnScream = (request, response) => {
  const newComment = {
    body: request.body.body,
    created_at: new Date().toISOString(),
    scream_id: request.params.scream_id,
    user_handle: request.user.user_handle,
    user_image: request.user.image_url,
  };

  db.doc(`/screams/${request.params.scream_id}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return response.status(404).json({ error: "Scream not found" });
      }
      return doc.ref.update({ comment_count: doc.data().comment_count + 1 });
    })
    .then(() => {
      return db.collection("comments").add(newComment);
    })
    .then(() => {
      return response.json(newComment);
    })
    .catch((err) => {
      return response.status(500).json({ error: err.message });
    });
};

exports.likeScream = (request, response) => {
  const likeDocument = db
    .collection("likes")
    .where("user_handle", "==", request.user.user_handle)
    .where("scream_id", "==", request.params.scream_id)
    .limit(1);

  const screamDocument = db.doc(`/screams/${request.params.scream_id}`);

  let screamData;

  screamDocument
    .get()
    .then((doc) => {
      if (doc.exists) {
        screamData = doc.data();
        screamData.scream_id = doc.id;
        return likeDocument.get();
      } else {
        return response.status(404).json({ error: "Scream not found" });
      }
    })
    .then((data) => {
      if (data.empty) {
        return db
          .collection("likes")
          .add({
            scream_id: request.params.scream_id,
            user_handle: request.user.user_handle,
          })
          .then(() => {
            screamData.like_count++;
            return screamDocument.update({ like_count: screamData.like_count });
          })
          .then(() => {
            return response.json(screamData);
          });
      } else {
        return response.status(400).json({ error: "Scream already liked" });
      }
    })
    .catch((err) => {
      response.status(500).json({ error: err.message });
    });
};

exports.unLikeScream = (request, response) => {
  const likeDocument = db
    .collection("likes")
    .where("user_handle", "==", request.user.user_handle)
    .where("scream_id", "==", request.params.scream_id)
    .limit(1);

  const screamDocument = db.doc(`/screams/${request.params.scream_id}`);

  let screamData;

  screamDocument
    .get()
    .then((doc) => {
      if (doc.exists) {
        screamData = doc.data();
        screamData.scream_id = doc.id;
        return likeDocument.get();
      } else {
        return response.status(404).json({ error: "Scream not found" });
      }
    })
    .then((data) => {
      if (data.empty) {
        return response.status(400).json({ error: "Scream not liked" });
      } else {
        return db
          .doc(`/likes/${data.docs[0].id}`)
          .delete()
          .then(() => {
            screamData.like_count--;
            return screamDocument.update({ like_count: screamData.like_count });
          })
          .then(() => {
            return response.json(screamData);
          });
      }
    })
    .catch((err) => {
      response.status(500).json({ error: err.message });
    });
};

exports.deleteScream = (request, response) => {
  const document = db.doc(`/screams/${request.params.scream_id}`);
  document
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return response.status(404).json({ error: "Scream not found" });
      }
      if (doc.data().user_handle !== request.user.user_handle) {
        return response.status(403).json({ error: "Unauthorized" });
      } else {
        return document.delete();
      }
    })
    .then(() => {
      return response.json({ message: "Scream deleted successfully" });
    })
    .catch((err) => {
      return response.status(500).json({ error: err.message });
    });
};

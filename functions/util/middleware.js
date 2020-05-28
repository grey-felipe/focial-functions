const { admin, db } = require("./admin");

// eslint-disable-next-line consistent-return
module.exports = (request, response, next) => {
  let token;
  if (
    request.headers.authorization &&
    request.headers.authorization.startsWith("Bearer ")
  ) {
    token = request.headers.authorization.split("Bearer ")[1];
  } else {
    return response.status(403).json({ error: "Unauthorized" });
  }

  admin
    .auth()
    .verifyIdToken(token)
    .then((decodedToken) => {
      request.user = decodedToken;
      return db
        .collection("users")
        .where("user_id", "==", request.user.uid)
        .limit(1)
        .get();
    })
    .then((data) => {
      request.user.user_handle = data.docs[0].data().user_handle;
      request.user.image_url = data.docs[0].data().image_url;
      return next();
    })
    .catch((err) => {
      console.error(err);
      return response.status(403).json({ error: err.message });
    });
};

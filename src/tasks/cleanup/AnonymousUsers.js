const moment = require('moment')
const admin = require('firebase-admin')

function userAnonymous (user) {
  return !((user.email && user.emailVerified) ||
    user.phoneNumber ||
    user.providerData.length > 0 ||
    user.disabled)
}

const cleanupPagination = 50
async function cleanup (obj) {
  // Recursively cleanup users on each page
  const cutoffDate1 = moment().subtract(7, 'days')
  const cutoffDate2 = moment().subtract(1, 'year')
  let deleteCount = 0
  for (const user of obj.users) {
    const lastSignin = moment(user.metadata.lastSignInTime)
    if (lastSignin.isBefore(userAnonymous(user) ? cutoffDate1 : cutoffDate2)) {
      console.log('delete ' + user.uid)
      await admin.auth().deleteUser(user.uid)
      deleteCount += 1
    }
  }
  if (obj.pageToken) {
    return admin.auth().listUsers(cleanupPagination, obj.pageToken)
      .then(cleanup)
      .then(count => count + deleteCount) // Calculate total deleted user count
  }
  return 0
}
module.exports = (req, res) => {
  console.log('got it')
  admin.auth().listUsers(cleanupPagination)
    .then(cleanup)
    .then(count => {
      res.send({
        delete_count: count
      })
    })
    .catch(error => {
      res.status(500).send(error)
    })
}

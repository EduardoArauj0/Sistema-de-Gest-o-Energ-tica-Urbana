const { usersService } = require('./users.service');

class UsersController {
  listTechnicians(_req, res, next) {
    try {
      const items = usersService.listActiveTechnicians();
      res.status(200).json({
        dataOrigin: 'SIMULADO',
        count: items.length,
        items,
      });
    } catch (err) {
      next(err);
    }
  }

  listAll(_req, res, next) {
    try {
      const items = usersService.listAll();
      res.status(200).json({
        dataOrigin: 'SIMULADO',
        count: items.length,
        items,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = {
  UsersController,
  usersController: new UsersController(),
};

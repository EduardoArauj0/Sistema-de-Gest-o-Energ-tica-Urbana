const { usersRepository } = require('./users.repository');
const { AppError } = require('../../shared/errors/AppError');

class UsersService {
  getById(id) {
    const user = usersRepository.findById(id);
    if (!user) {
      throw new AppError('Usuário não encontrado.', {
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        field: 'id',
        reason: 'Nenhum usuário corresponde ao identificador informado.',
      });
    }
    return user;
  }

  listActiveTechnicians() {
    return usersRepository.findActiveTechnicians();
  }

  listAll() {
    return usersRepository.findAll();
  }
}

module.exports = {
  UsersService,
  usersService: new UsersService(),
};

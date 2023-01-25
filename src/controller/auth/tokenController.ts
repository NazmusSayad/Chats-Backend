import { Response, Request } from 'express'
import { checkType } from 'express-master'
import nodeEnv from 'manual-node-env'
import * as jwt from '../../utils/jwt'
import { UserDocument } from '../../model/User'
import { mainIo } from '../../socket'

export interface UserRequest extends Request {
  user: UserDocument
  io: {
    send: typeof mainIo.emit
    sendTo(ev: string, rooms: string | [string], data: unknown): void
    disconnect: typeof mainIo.disconnectSockets
  }
}

const cookieOptions: any = {
  secure: !nodeEnv.isDev,
  sameSite: 'strict',
  maxAge: 86400000 /* 1 day -> miliseconds */ * 30,
}

export const sendCookieToken = (req: UserRequest, res: Response) => {
  res.cookie('hasToken', true, cookieOptions)
  res.cookie('token', jwt.generateJwt(req.user._id), {
    ...cookieOptions,
    httpOnly: true,
  })

  const token = jwt.generateJwt(req.user._id)
  res.success({ user: req.user.getSafeInfo(), token })
}

export const clearCookieToken = (req, res: Response) => {
  res.clearCookie('token')
  res.clearCookie('hasToken')
  res.status(204).end()
}

export const getAuthToken = async (req: UserRequest, res: Response, next) => {
  const { token } = req.cookies
  checkType.string({ token })
  req.user = await jwt.parseUserFromJwt(token)
  next()
}

const checkAuthFactory =
  (verified: boolean) => async (req: UserRequest, res, next) => {
    const { authorization, socketid } = req.headers
    checkType.string({ authorization })

    const user = await jwt.parseUserFromJwt(authorization, verified)
    const sockets = mainIo.to(user._id.toString()).except(socketid)

    req.user = user
    req.io = {
      send: sockets.emit,
      disconnect: sockets.disconnectSockets,
      sendTo(ev, rooms, data) {
        mainIo.to(rooms).to(user._id.toString()).except(socketid).emit(ev, data)
      },
    }

    next()
  }

export const checkAuthToken = checkAuthFactory(true)
export const checkAuthTokenNotVerified = checkAuthFactory(false)

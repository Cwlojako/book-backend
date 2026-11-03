const express = require('express')
const cors = require('cors')
const axios = require('axios')
const bodyParser = require("body-parser")
const multer = require('multer')
const Jimp = require('jimp')
const app = express()
const mongoose = require('mongoose')
const crypto = require('crypto')
const Schema = mongoose.Schema
const orderSchema = new Schema({
	uuid: String, // id
	buyer: String, // 购买人
	list: Array, // 书单
	price: Number, // 总价
	profit: Number, // 利润
	deliverCount: Number, // 快递数
	isDeal: { type: Number, default: 0 }, // 是否成交 0未成交 1已成交
	remark: String, // 备注
	receiver: String, // 收货人
	receiverPhone: String, // 收货人电话
	receiverAddress: String, // 收货人地址
	createTime: { type: Date, default: Date.now },
	xgReceiverId: String, // 小谷吖收货地址id
	xgDiscountEnabled: Boolean, // 小谷吖是否开启折扣
	userId: String // 所属账号
})
const xgTokenSchema = new Schema({
	uuid: String, // id
	token: String,
	name: String,
	status: String, // ['frequent', 'expired']
	userId: String // 所属账号
})
const userSchema = new Schema({
	username: { type: String, unique: true, required: true },
	salt: String,
	passwordHash: String
})
mongoose.connect('mongodb://admin:chenweiQQ0!@39.106.72.81:27017/admin').then(() => {
	seedAdmin()
}).catch(err => {
	console.log('MongoDB 连接失败', err)
})
const Order = mongoose.model('Order', orderSchema)
const XgToken = mongoose.model('XgToken', xgTokenSchema)
const User = mongoose.model('User', userSchema)

// ========== 认证相关（仅用内置 crypto，不引入额外依赖） ==========
const TOKEN_SECRET = 'book-fast-query-auth-secret-2026'

function hashPassword(password, salt) {
	return crypto.scryptSync(password, salt, 64).toString('hex')
}

function verifyPassword(password, salt, hash) {
	const test = crypto.scryptSync(password, salt, 64).toString('hex')
	const a = Buffer.from(hash, 'hex')
	const b = Buffer.from(test, 'hex')
	return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function signToken(payload) {
	const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
	const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 7 * 24 * 3600 * 1000 })).toString('base64url')
	const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${body}`).digest('base64url')
	return `${header}.${body}.${sig}`
}

function verifyToken(token) {
	try {
		const parts = String(token || '').split('.')
		if (parts.length !== 3) return null
		const [header, body, sig] = parts
		const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${body}`).digest('base64url')
		if (sig !== expected) return null
		const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
		if (!payload.exp || payload.exp < Date.now()) return null
		return payload
	} catch (e) {
		return null
	}
}

function auth(req, res, next) {
	const header = req.headers.authorization || ''
	const token = header.startsWith('Bearer ') ? header.slice(7) : ''
	const payload = verifyToken(token)
	if (!payload) {
		return res.status(401).send({ code: 401, message: '未登录或登录已过期' })
	}
	req.user = payload
	next()
}

// 初始化 admin 账号，并把历史数据挂到 admin 下
async function seedAdmin() {
	let admin = await User.findOne({ username: 'admin' })
	if (!admin) {
		const salt = crypto.randomBytes(16).toString('hex')
		const passwordHash = hashPassword('adminbook888', salt)
		admin = await new User({ username: 'admin', salt, passwordHash }).save()
		console.log('已初始化 admin 账号（密码 adminbook888）')
	}
	const adminId = admin._id.toString()
	await Order.updateMany({ userId: { $exists: false } }, { $set: { userId: adminId } })
	await XgToken.updateMany({ userId: { $exists: false } }, { $set: { userId: adminId } })
	console.log('历史数据已归属 admin 账号')

	// 建立索引，加快订单/小谷Token列表查询
	try {
		await Order.collection.createIndex({ userId: 1, createTime: -1 })
		await XgToken.collection.createIndex({ userId: 1 })
		console.log('索引已建立')
	} catch (e) {
		console.log('建立索引失败', e)
	}
}

const corsOptions = {
	// origin: 'http://39.106.72.81:8000'
	origin: '*'
}

app.use(cors(corsOptions))
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

// 登录（公开）
app.post('/login', async (req, res) => {
	try {
		const { username, password } = req.body
		if (!username || !password) {
			return res.status(400).send({ code: 400, message: '请输入用户名和密码' })
		}
		const user = await User.findOne({ username })
		if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
			return res.status(401).send({ code: 401, message: '用户名或密码错误' })
		}
		const token = signToken({ userId: user._id.toString(), username: user.username })
		res.send({ code: 200, message: '登录成功', data: { token, username: user.username } })
	} catch (error) {
		console.log(error)
		res.status(500).send(error)
	}
})

// 鉴权：以下所有接口都需要登录
app.use(auth)

// 保存订单
app.post('/saveOrder', async (req, res) => {
	try {
		const { uuid, buyer, list, price, deliverCount, profit } = req.body
		const order = new Order({ uuid, buyer, list, price, deliverCount, profit, userId: req.user.userId })
		await order.save()
		res.send({ code: 200, message: '保存成功', data: order })
	} catch(error) {
		res.status(400).send(error)
	}
})

// 更新订单
app.put('/order/:uuid', async (req, res) => {
    try {
        const order = await Order.findOneAndUpdate({ uuid: req.params.uuid, userId: req.user.userId }, req.body, { new: true, runValidators: true })
        if (!order) {
            return res.status(404).send()
        }
        res.send(order)
    } catch (error) {
		console.log(error)
        res.status(400).send(error)
    }
})

// 删除订单
app.delete('/order/:uuid', async (req, res) => {
    try {
        const order = await Order.deleteOne({ uuid: req.params.uuid, userId: req.user.userId })
        if (!order) {
            return res.status(404).send()
        }
        res.send(order)
    } catch (error) {
        res.status(500).send(error)
    }
})

// 获取单个订单完整信息（订单列表接口为提速不返回 list，详情按需单独拉取）
app.get('/order/:uuid', async (req, res) => {
    try {
        const order = await Order.findOne({ uuid: req.params.uuid, userId: req.user.userId }).lean()
        if (!order) {
            return res.status(404).send({ code: 404, message: '未找到对应的订单' })
        }
        res.send(order)
    } catch (error) {
        console.log(error)
        res.status(500).send(error)
    }
})

// 订单是否成交
app.post('/order/deal/:uuid', async (req, res) => {
	try {
		const order = await Order.findOneAndUpdate({ uuid: req.params.uuid, userId: req.user.userId }, { isDeal: req.body.isDeal }, { new: true, runValidators: true })
		if (!order) {
			return res.status(404).send()
		}
		res.send(order)
	} catch (error) {
		res.status(400).send(error)
	}
})

function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// 获取订单列表
app.post('/orderList', async (req, res) => {
    const { pageSize = 10, pageNo = 1, buyer, isDeal, startDate, endDate, minPrice, maxPrice, bookCount } = req.body
    const limit = parseInt(pageSize)
    const skip = (parseInt(pageNo) - 1) * limit
	const query = { userId: req.user.userId }
    if (buyer) {
        // escape 出现的特殊符号
        query.buyer = new RegExp(escapeRegex(buyer), 'i')
    }
	if (isDeal !== undefined) {
		query.isDeal = isDeal
	}
	if (startDate || endDate) {
		query.createTime = {}
		if (startDate) {
			query.createTime.$gte = new Date(startDate)
		}
		if (endDate) {
			query.createTime.$lte = new Date(endDate + 'T23:59:59.999')
		}
	}
	// 订单金额搜索（区间）
	const toNum = v => (v === undefined || v === null || v === '' ? undefined : Number(v))
	const minPriceNum = toNum(minPrice)
	const maxPriceNum = toNum(maxPrice)
	if (minPriceNum !== undefined || maxPriceNum !== undefined) {
		query.price = {}
		if (minPriceNum !== undefined) query.price.$gte = minPriceNum
		if (maxPriceNum !== undefined) query.price.$lte = maxPriceNum
	}
	// 书单本数搜索（list 长度，精确匹配多少本书）
	const bookCountNum = toNum(bookCount)
	if (bookCountNum !== undefined) {
		query.list = { $size: bookCountNum }
	}
    try {
        const orders = await Order.find(query).select('-list').sort({ createTime: -1 }).limit(limit).skip(skip).lean()
        const total = await Order.countDocuments(query)
        res.send({ total, data: orders })
    } catch (error) {
		console.log(error)
        res.status(500).send(error)
    }
})

// 有路搜索
app.get('/youlu', async (req, res) => {
	const { isbn, cookie } = req.query
	const { data: html } = await axios.get(`https://www.youlu.net/search/result3/?isbn=${isbn}`, {
		headers: { cookie }
	})
	res.setHeader('Content-Type', 'text/html')
	res.send(html)
})

// 有路详情
app.get('/youlu/detail', async (req, res) => {
	const { bookId } = req.query
	const { data: detail } = await axios.get(`https://www.youlu.net/info3/bookBuy.aspx?bookId=${bookId}`)
	res.send(detail)
})

// 有路加购
app.get('/youlu/addCart', async (req, res) => {
	const { bookId, buyCount, cookie } = req.query
	const { data: result } = await axios.get(`https://www.youlu.net/info3/youluBuy.aspx?bookId=${bookId}&buyCount=${buyCount}&category=old`, {
		headers: { cookie }
	})
	res.send(result)
})


// 小谷吖搜索
app.get('/xiaoguya', async (req, res) => {
	const { isbn, token } = req.query
	try {
		const { data: result } = await axios.get(`https://api.xiaoguya.com:9898/mall/api/mall/product/search/searchProduct?current=1&size=20&keyword=${isbn}`, {
			headers: {
				'Authorization': token,
				'Content-Type': 'application/json'
			}
		})
		res.send(result)
	} catch(err) {
		if (err.response.status === 401) {
			res.send({ code: 401, message: '小谷Token已过期，请更新Token'})
		}
	}
})

// 小谷吖详情
app.get('/xiaoguya/detail', async (req, res) => {
	const { bookId, token } = req.query
	try {
		const { data: result } = await axios.get(`https://api.xiaoguya.com:9898/mall/api/mall/product/infoById/${bookId}`, {
			headers: {
				'Authorization': token,
				'Content-Type': 'application/json'
			}
		})
		res.send(result)
	} catch(err) {
		if (err.response.status === 401) {
			res.send({ code: 401, message: '小谷Token已过期，请更新Token'})
		}
	}
})

// 小谷吖加购
app.get('/xiaoguya/addCart', async (req, res) => {
	const { specId, token, count, isbn } = req.query
	try {
		const { data: result } = await axios.post(`https://api.xiaoguya.com:9898/mall/api/mall/cart/add/${specId}/${count}`, {}, {
			headers: {
				'Authorization': token
			}
		})
		res.send(result)
	} catch(err) {
		if (err.response.status === 401) {
			res.send({ code: 401, message: '小谷Token已过期，请更新Token'})
		}else if (err.response.data?.code === 19003) {
			res.send({ code: 400, message: '该商品限购4个', data: { isbn } })
		} else {
			res.send({ code: 500, message: err.response.data.msg, data: { isbn } })
		}
	}
})

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function generateNonce(length = 64) {
	const buf = crypto.randomBytes(length)
	let result = ''
	for (let i = 0; i < length; i++) {
		const idx = buf[i] % 62
		result += CHARSET[idx]
	}
	return result
}

// 小谷吖结算创建订单
app.post('/xiaoguya/createOrder', async (req, res) => {
	const { receiverId, receiverName, province, city, district, phone, address, confirmItems, token } = req.body
	let params = {
		receiverId,
		receiverName,
		province,
		city,
		district,
		phone,
		address,
		confirmItems,
		nonce: generateNonce(64),
		memo: ''
	}
	try {
		const { data: result } = await axios.post(`https://api.xiaoguya.com:9898/mall/api/mall/order/create`, params, {
			headers: {
				'Authorization': token
			}
		})
		if (result.success) {
			res.send({ code: 200, message: '创建成功', data: result.data })
		}
	} catch (err) {
		console.log(err)
		res.status(500).send(err)
	}
})


// 书嗨搜索
app.get('/shuhai/search', async (req, res) => {
	const { isbn, token } = req.query
	try {
		const { data: result } = await axios.get(`https://bpi.shuhi.com/api/token/shop/user/searchRecommend?keyword=${isbn}`, {
			headers: {
				'Authorization': token,
				'Content-Type': 'application/json'
			}
		})
		if (result.data.isbn === isbn) {
			res.send({ code: 200, message: '查询成功', data: result.data })
		} else {
			res.send({ code: 404, message: '未找到该书' })
		}
	} catch(err) {
		if (err.response.status === 401) {
			res.send({ code: 401, message: '书嗨Token已过期，请更新Token'})
		}
	}
})

// 书嗨加购
app.post('/shuhai/addCart', async (req, res) => {
	const { token, isbn, quantity, conditionType } = req.body
	const params = {
		"isbn": isbn,
		"quantity": quantity,
		"conditionType": conditionType,
		"sourceFrom": 1
	}
	try {
		const { data: result } = await axios.post(`https://bpi.shuhi.com/api/token/shop/cart/add`, params, {
			headers: {
				'Authorization': token,
				'Content-Type': 'application/json'
			}
		})
		res.send(result)
	} catch(err) {
		if (err.response.status === 401) {
			res.send({ code: 401, message: '书嗨Token已过期，请更新Token'})
		} else {
			res.send({ code: 500, message: err.response.data.msg, data: { isbn } })
		}
	}
})

// 星辰搜索
app.get('/xc', async (req, res) => {
	const { isbn, token } = req.query
	const { data: result } = await axios.get(`https://book.xclink.cn/xc-app/linkitembook/searchList?pageNum=0&pageSize=10&condition=${isbn}&typeId=&typeId2=&isStock=0&isPriceSort=0`, {
		headers: { token: token }
	})
	res.send(result)
})

// 星辰详情
app.get('/xc/detail', async (req, res) => {
	const { bookId } = req.query
	const { data: result } = await axios.get(`https://book.xclink.cn/xc-app/linkitembook/bookCondition?bookId=${bookId}`)
	res.send(result)
})

// 星辰加购
app.get('/xc/addCart', async (req, res) => {
	const { itemId, token, num, conditionId, specificationId } = req.query
	const { data: result } = await axios.post(`https://book.xclink.cn/xc-app/linkshoppingcart/save`, {
		itemId, token, num, conditionId, specificationId
	}, {
		headers: { "Content-Type": 'application/x-www-form-urlencoded' }
	})
	if (result.message === '请登录' && result.status === 2) {
		res.send({ code: 401, message: '请设置星辰Token' })
		return
	}
	res.send(result)
})

// 孔夫子搜索
app.get('/kfz', async (req, res) => {
	const { isbn, cookie } = req.query
	const { data: result } = await axios.get(`https://search.kongfz.com/pc-gw/search-web/client/pc/product/keyword/list?dataType=0&keyword=${isbn}&page=1&size=80&sortType=7&actionPath=sortType&userArea=12001000000`, {
		headers: { cookie }
	})
	res.send(result)
})

// 孔夫子详情
app.get('/kfz/detail', async (req, res) => {
	const { shopId, itemId, cookie } = req.query
	const { data: html } = await axios.get(`https://book.kongfz.com/${shopId}/${itemId}/`, {
		headers: { cookie }
	})
	res.setHeader('Content-Type', 'text/html')
	res.send(html)
})

// 孔夫子加购
app.get('/kfz/addCart', async (req, res) => {
	const { itemId, shopId, numbers, cookie } = req.query
	const { data: result } = await axios.get(`https://cart.kongfz.com/jsonp/add?&itemId=${itemId}&shopId=${shopId}&numbers=${numbers}`, {
		headers: { cookie }
	})
	if (numbers > 1) {
		const cartId = result.result.cartId + ''
		await axios.post(`https://cart.kongfz.com/cart-web/pc/v1/cart/updateCartNum`, {}, {
			params: { cartId, number: numbers },
			headers: { cookie }
		})
	}
	res.send(result)
})

//孔夫子获取cookie
app.get('/kfz/getCookie', async (req, res) => {
	const result = await axios.post(`https://login.kongfz.com/Pc/Login/account`, {
		loginName: '13202547840',
		loginPass: 'chenweiqq0'
	}, {
		headers: { "Content-Type": 'application/x-www-form-urlencoded' }
	})
	const cookie = result.headers['set-cookie'].find(f => f.startsWith('PHPSESSID')).split(';')[0]
	res.send(cookie)
})

// 孔夫子指定书店搜索
app.get('/kfz/shopSearch', async (req, res) => {
	const { isbn, cookie, shopId } = req.query
	const { data: html } = await axios.get(`https://shop.kongfz.com/${shopId}/search/?key=${isbn}`, {
		headers: { cookie }
	})
	res.setHeader('Content-Type', 'text/html')
	res.send(html)
})

function getRecentThirtyDaysRange() {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 29)

    const format = d => {
        const m = `${d.getMonth() + 1}`.padStart(2, '0')
        const day = `${d.getDate()}`.padStart(2, '0')
        return `${d.getFullYear()}-${m}-${day}`
    }

    return { startDate: format(start), endDate: format(end) }
}

// 孔夫子根据手机号搜索订单
app.post('/kfz/orderSearch', async (req, res) => {
	try {
		const { phone, cookie } = req.body
		const { startDate: sd, endDate: ed } = getRecentThirtyDaysRange()
		const startDate = `${sd} 00:00:00`
		const endDate = `${ed} 23:59:59`
		let params = {
			page: 1,
			size: 50,
			mobile: phone,
			startDate,
			endDate
		}
		const { data: result } = await axios.post(`https://order.kongfz.com/pc-gw/order-web/pc/v1/buyer/order/list`, params, {
			headers: { 
				cookie
			}
		})
		const list = result.result.list ? result.result.list.filter(f => f.orderStatusName.indexOf('退款') === -1) : []
		res.send(list)
	} catch(error) {
		res.status(400).send(error)
	}
})

// 小谷吖根据收货人id筛选订单
app.post('/xgy/orderSearch', async (req, res) => {
	try {
		const { receiverId, token } = req.body
		const { data: result1 } = await axios.get(`https://api.xiaoguya.com:9898/mall/api/mall/order/listPage?current=1&size=200&orderStatus=`, {
			headers: { 
				'Authorization': token
			}
		})
		const { data: result2 } = await axios.get(`https://api.xiaoguya.com:9898/mall/api/mall/order/listPage?current=2&size=200&orderStatus=`, {
			headers: { 
				'Authorization': token
			}
		})
		const records = result1.data.records.concat(result2.data.records)
		const list = records.filter(f => f.receiverId == receiverId)
		let promises = list.map(e => {
			return axios.get(`https://api.xiaoguya.com:9898/mall/api/mall/order/getById/${e.id}`, {
				headers: { 
					'Authorization': token
				}
			})
		})
		const details = await Promise.all(promises)
		list.forEach((e, index) => {
			e.orderDetail = details[index].data.data
		})
		res.send(list)
	} catch(error) {
		console.log('-=-=-=-=', error)
		res.status(400).send(error)
	}
})

// 星辰筛选订单
app.post('/xc/orderSearch', async (req, res) => {
	try {
		const { token, phone } = req.body
		const { data: result } = await axios.get(`https://book.xclink.cn/xc-app/linktradetrade/list?pageNum=1&pageSize=100&token=${token}&status=`, {
			headers: { 
				token,
				"Content-Type": 'application/x-www-form-urlencoded'
			}
		})
		const list = result.data.list.filter(f => f.receiverMobile == phone)
		res.send(list)
	} catch (error) {
		console.log(error)
		res.status(400).send(error)
	}
})

// 旧书云筛选订单
app.post('/jsy/orderSearch', async (req, res) => {
	try {
		const { token, isbnList = [] } = req.body
		const { data: result } = await axios.get(`https://www.jiushuyunshop.com/api/collect/shop/order/list?type=&page=1&limit=10`, { headers: { authorization: token } })
		let list = result.data.data.map(m => {
			return {
				isbnList: m.item.map(m => m.goods_title.match(/978\d{10}/g)[0]),
				...m
			}
		})
		list = list.filter(f => f.isbnList.sort().join('|') === isbnList.sort().join('|'))
		let promises = list.map(e => {
			return axios.get(`https://www.jiushuyunshop.com/api/collect/shop/order/detail?id=${e.id}`, { headers: { authorization: token } })
		})
		const details = await Promise.all(promises)
		
		list.forEach((e, index) => {
			e.orderDetail = details[index].data.data
		})
		res.send(list)
	} catch (error) {
		console.log(error)
		res.status(400).send(error)
	}
})

// 旧书云搜索
app.get('/jsy', async (req, res) => {
	const { isbn } = req.query
	const { data: result } = await axios.get(`https://www.jiushuyunshop.com/api/collect/shop/list?category_id=1&keywords=${isbn}&limit=10&page=1&order=price asc`)
	res.send(result)
})

// 旧书云加购
app.get('/jsy/addCart', async (req, res) => {
	const { bookId, quantity, token } = req.query
	const { data: result } = await axios.post(`https://www.jiushuyunshop.com/api/collect/shop/car/add`, 
		{
			goods_id: bookId,
			goods_num: quantity
		},
		{
			headers: { 'Authorization': token }
		}
	)
	if (result.code === 400) {
		res.send({ code: 401, message: '请设置旧书云Token' })
		return
	}
	res.send(result)
})

// 保存小谷Token
app.post('/saveXgToken', async (req, res) => {
	try {
		const { uuid, token, name } = req.body
		const xgToken = new XgToken({ uuid, token, name, userId: req.user.userId })
		await xgToken.save()
		res.send({ code: 200, message: '保存成功', xgToken })
	} catch(error) {
		res.status(400).send(error)
	}
})

// 获取小谷token列表，无需分页
app.get('/xgTokenList', async (req, res) => {
	try {
		const xgTokens = await XgToken.find({ userId: req.user.userId })
		res.send({ data: xgTokens })
	} catch (error) {
		res.status(500).send(error)
	}
})

// 删除小谷token
app.delete('/xgToken/:uuid', async (req, res) => {
	try {
		const { uuid } = req.params
		await XgToken.deleteOne({ uuid, userId: req.user.userId })
		res.send({ code: 200, message: '删除成功' })
	} catch (error) {
		res.status(500).send(error)
	}
})

// 更新小谷token
app.post('/updateXgToken', async (req, res) => {
	try {
        const { uuid, token, name, status } = req.body
		
        const update = {}
        if (token !== undefined) update.token = token
        if (name !== undefined) update.name = name
        if (status !== undefined) update.status = status

        const xgToken = await XgToken.findOneAndUpdate({ uuid, userId: req.user.userId }, update, { new: true, runValidators: true })
        if (!xgToken) {
            return res.status(404).send({ code: 404, message: '未找到对应的 XgToken' })
        }
        res.send({ code: 200, message: '更新成功', xgToken })
    } catch (error) {
        res.status(400).send(error)
    }
})

// 更新小谷地址信息
app.post('/updateXgAddress', async (req, res) => {
	try {
		const { token, phone, receiverName, province, city, district, address, orderId } = req.body
		const { data: result } = await axios.get(`https://api.xiaoguya.com:9898/iam/api/addr/list`, {
			headers: { 'Authorization': token }
		})
		if (result.data.length < 20) {
			await axios.post('https://api.xiaoguya.com:9898/iam/api/addr/create', {
				receiverName,
				phone,
				province,
				city,
				district,
				address,
				isDefault: false
			}, {
				headers: { 'Authorization': token }
			})
		} else {
			const firstId = result.data[0]?.id
			await axios.post(`https://api.xiaoguya.com:9898/iam/api/addr/deleteById/${firstId}`, {}, {
				headers: { 'Authorization': token }
			})
			await axios.post('https://api.xiaoguya.com:9898/iam/api/addr/create', {
				receiverName,
				phone,
				province,
				city,
				district,
				address,
				isDefault: false
			}, {
				headers: { 'Authorization': token }
			})
		}
		const { data: addrList } = await axios.get(`https://api.xiaoguya.com:9898/iam/api/addr/list`, {
			headers: { 'Authorization': token }
		})
		const xgReceiverId = addrList.data[addrList.data.length - 1]?.id
		const order = await Order.findOneAndUpdate({ uuid: orderId, userId: req.user.userId }, { xgReceiverId }, { new: true, runValidators: true })
		if (!order) {
            return res.status(404).send({ code: 404, message: '未找到对应的订单' })
        }
		res.send({ code: 200, message: '更新成功', data: xgReceiverId })
	} catch (error) {
		console.log('error', error)
		res.status(500).send(error)
	}
})

// 更新星辰地址
app.post('/updateXcAddress', async (req, res) => {
	try {
		const { token, phone, receiverName, province, city, district, address } = req.body
		const { data: addrList } = await axios.post('https://book.xclink.cn/xc-app/linkuseraddress/List', { token }, {
			headers: { 
				token,
				"Content-Type": 'application/x-www-form-urlencoded'
			}
		})
		const id = addrList.data[addrList.data.length - 1]?.id
		await axios.post('https://book.xclink.cn/xc-app/linkuseraddress/update', {
			token,
			id,
			name: receiverName,
			phone,
			province,
			city,
			prefecture: district,
			address,
			status: 0
		}, {
			headers: {
				'Content-Type': 'application/json'
			}
		})
		res.send({ code: 200, message: '更新成功' })
	} catch (error) {
		console.log(error)
		res.status(500).send(error)
	}
})

// 更新孔夫子地址
app.post('/updateKfzAddress', async (req, res) => {
	try {
		const { cookie, phone, receiverName, province, city, district, address } = req.body
		const { data: addrList } = await axios.get('https://user.kongfz.com/pc-gw/user-service/client/pc/address/list', { headers: { cookie } })
		const { data: provinceData } = await axios.get('https://user.kongfz.com/?m=User&c=Ajax&a=getTopArea', { headers: { cookie } })
		const provinceAreaId = provinceData.data.find(f => province.indexOf(f.simple) > -1)?.id ?? ''
		if (provinceAreaId) {
			// 直辖市（北京/上海/天津/重庆）没有市一级，直接用省 id 查区县
			const municipalities = ['北京', '上海', '天津', '重庆']
			const isMunicipality = municipalities.some(m => province.indexOf(m) > -1)
			let areaId = ''
			if (isMunicipality) {
				const { data: districtData } = await axios.get(`https://user.kongfz.com/?m=User&c=Ajax&a=getChildrenArea&level=1&areaId=${provinceAreaId}`, { headers: { cookie } })
				const found = districtData.data?.find(f => district.indexOf(f.simple) > -1)
				if (found) { 
					areaId = found.id
				}
			} else {
				const { data: cityData } = await axios.get(`https://user.kongfz.com/?m=User&c=Ajax&a=getChildrenArea&level=1&areaId=${provinceAreaId}`, { headers: { cookie } })
				const cityAreaId = cityData.data.find(f => city.indexOf(f.simple) > -1)?.id ?? ''
				if (cityAreaId) {
					const { data: districtData } = await axios.get(`https://user.kongfz.com/?m=User&c=Ajax&a=getChildrenArea&level=2&areaId=${cityAreaId}`, { headers: { cookie } })
					areaId = districtData.data.length ? districtData.data.find(f => district.indexOf(f.simple) > -1)?.id ?? '' : cityAreaId
				}
			}
			if (areaId) {
				const lastId = addrList.data[addrList.data.length - 1].addrId
				await axios.put(`https://user.kongfz.com/pc-gw/user-service/client/pc/address/${lastId}`, {
					address,
					area: areaId,
					isDefault: '1',
					mobile: phone,
					receiverName
				}, { headers: { cookie } })
				res.send({ code: 200, message: '更新成功' })
			} else {
				res.send({ code: 500, message: '请检查地址' })
			}
		} else {
			res.send({ code: 500, message: '请检查地址' })
		}
	} catch (error) {
		console.log(error)
		res.status(500).send(error)
	}
})

// 更新旧书云地址
app.post('/updateJsyAddress', async (req, res) => {
	try {
		const { token, phone, receiverName, province, city, district, address } = req.body
		const { data: addrList } = await axios.get('https://www.jiushuyunshop.com/api/collect/shop/address/list?page=1&limit=100', { headers: { authorization: token } })

		if (addrList.status_code != 200) {
			res.send({ code: 500, message: addrList.message })
			return
		}
		const lastId = addrList.data[addrList.data.length - 1]?.id ?? ''
		const { data: areaList } = await axios.get('https://www.jiushuyunshop.com/api/collect/shop/address/area')
		const provinceData = areaList.data.provinceData
		const cityData = areaList.data.cityData
		const areaData = areaList.data.areaData
		let provinceId = provinceData.find(f => province.indexOf(f.label) > -1).code
		let idx = provinceData.findIndex(f => province.indexOf(f.label) > -1)
		let cityId = cityData[idx].find(f => city.indexOf(f.label) > -1).value
		let cityIdx = cityData[idx].findIndex(f => city.indexOf(f.label) > -1)
		let areaId = areaData[idx][cityIdx].find(f => district.indexOf(f.label) > -1).value
		const params = {
			address,
			area_name: district,
			area_id: areaId,
			area_text: `${province}-${city}-${district}`,
			city_name: city,
			city_id: cityId,
			province_name: province,
			province_id: provinceId,
			id: lastId,
			consignee: receiverName,
			phone,
			user_id: "3457521",
			is_default: '1'
		}
		let { data: result } = await axios.post('https://www.jiushuyunshop.com/api/collect/shop/address/save', params, { headers: { authorization: token } })
		res.send({ code: 200, message: '更新成功' })
	} catch (error) {
		console.log(error)
		res.status(500).send(error)
	}
})

// 图片代理接口，解决前端 html2canvas 截图时封面图跨域问题
app.get('/img-proxy', async (req, res) => {
	const { url } = req.query
	if (!url) return res.status(400).json({ code: 400, message: '缺少 url 参数' })

	try {
		const { data, headers } = await axios.get(url, {
			responseType: 'arraybuffer',
			timeout: 15000, // 15秒超时
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
			}
		})
		res.set('Content-Type', headers['content-type'] || 'image/png')
		res.set('Cache-Control', 'public, max-age=86400') // 缓存1天
		res.send(Buffer.from(data))
	} catch (err) {
		res.status(500).json({ code: 500, message: '图片拉取失败' })
	}
})


const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
const DOUBAO_API_KEY = 'ark-3c237d7c-a190-4714-a1ec-556aa76935f5-4efef'
const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/responses'
const DOUBAO_MODEL_ID = 'ep-20260906221940-nww9g' // 视觉模型

// 图片压缩（长边 1024，省 token）
async function compress(buffer) {
	const image = await Jimp.read(buffer)
	const max = Math.max(image.bitmap.width, image.bitmap.height)
	if (max > 1024) {
		if (image.bitmap.width >= image.bitmap.height) {
			image.resize(1024, Jimp.AUTO)
		} else {
			image.resize(Jimp.AUTO, 1024)
		}
	}
	image.quality(85)
	const result = await image.getBufferAsync(Jimp.MIME_JPEG)
	return result.toString('base64')
}

// 调豆包
async function ocr(imageBuffer) {
	const b64 = await compress(imageBuffer)
	const res = await fetch(DOUBAO_API_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DOUBAO_API_KEY}` },
		body: JSON.stringify({
			model: DOUBAO_MODEL_ID,
			messages: [{
				role: 'user',
				content: [
					{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
					{ type: 'text', text: '找出图片中所有的ISBN书号（13位数字，通常以978或979开头，可能带有连字符，如978-7-5690-5636-5）。只返回JSON：{"isbns":["9787569056365"]}，书号请去掉连字符只保留13位数字。找不到返回{"isbns":[]}。不要其他内容。' }
				]
			}],
			max_tokens: 2048,
			temperature: 0
		})
	})
	const json = await res.json()
	if (!res.ok || json.error) {
			throw new Error(json.error?.message || `豆包API错误: ${res.status}`)
		}
		console.log('[OCR] 豆包响应:', JSON.stringify(json).slice(0, 200))
	// 从 AI 返回中提取 JSON
	const text = json.choices[0].message.content.replace(/```json|```/g, '').trim()
	const { isbns } = JSON.parse(text)
	// ISBN 校验位过滤
	const valid = isbns.filter(s => {
		if (!/^\d{13}$/.test(s) || !s.startsWith('9787')) return false
		let sum = 0
		for (let i = 0; i < 12; i++) sum += +s[i] * (i % 2 === 0 ? 1 : 3)
		return (10 - (sum % 10)) % 10 === +s[12]
	})
	return valid
}

app.post('/ocr/extract-isbn', upload.single('image'), async (req, res) => {
	try {
		if (!req.file) return res.status(400).json({ error: '未提供图片' })
		const isbns = await ocr(req.file.buffer)
		console.log(`[OCR] 识别到 ${isbns.length} 个 ISBN:`, isbns)
		res.json({ valid: isbns.map(isbn => ({ isbn })), invalid: [] })
	} catch (err) {
		console.error('[OCR]', err)
		res.status(500).json({ error: err.message })
	}
})

app.listen(3000, () => {
    console.log("启动成功！")
})

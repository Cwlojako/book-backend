const express = require('express')
const cors = require('cors')
const axios = require('axios')
const app = express()

const corsOptions = {
  origin: 'http://172.16.11.110:5173'
}

app.use(cors(corsOptions))

// 有路搜索
app.get('/youlu', async (req, res) => {
	const { isbn } = req.query
	const { data: html } = await axios.get(`https://www.youlu.net/search/result3/?isbn=${isbn}`)
	res.setHeader('Content-Type', 'text/html')
	res.send(html)
})

// 有路详情
app.get('/youlu/detail', async (req, res) => {
	const { bookId } = req.query
	const { data: detail } = await axios.get(`https://www.youlu.net/info3/bookBuy.aspx?bookId=${bookId}`)
	res.send(detail)
})

// 小谷吖搜索
app.get('/xiaoguya', async (req, res) => {
	const { isbn, token } = req.query
	try { 
		const { data: result } = await axios.get(`https://api.xiaoguya.com:9898/mall/api/mall/product/search/searchProduct?current=1&size=20&keyword=${isbn}`, {
			headers: {
				'Authorization': `bearer ${token}`,
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
				'Authorization': `bearer ${token}`,
				'Content-Type': 'application/json'
			}
		})
		res.send(result)
	} catch(err) {
		if (err.response.status === 401) {
			res.send({ code: 401, message: '小谷Token已过期，请更新Token'})
		}
	}
	
	// res.send(result)
})

// 星辰搜索
app.get('/xc', async (req, res) => {
	const { isbn } = req.query
	const { data: result } = await axios.get(`https://book.xclink.cn/xc-app/linkitembook/searchList?pageNum=0&pageSize=10&condition=${isbn}&typeId=&typeId2=&isStock=0&isPriceSort=0`)
	res.send(result)
})

// 星辰详情
app.get('/xc/detail', async (req, res) => {
	const { bookId } = req.query
	const { data: result } = await axios.get(`https://book.xclink.cn/xc-app/linkitembook/bookCondition?bookId=${bookId}`)
	res.send(result)
})

// 孔夫子搜索
app.get('/kfz', async (req, res) => {
	const { isbn, cookie } = req.query
	const { data: result } = await axios.get(`https://search.kongfz.com/pc-gw/search-web/client/pc/product/keyword/list?dataType=0&keyword=${isbn}&page=1&size=50&sortType=7&actionPath=sortType&userArea=12001000000`, {
		headers: { cookie }
	})
	res.send(result)
})

// 孔夫子详情
app.get('/kfz/detail', async (req, res) => {
	const { shopId, itemId } = req.query
	console.log(`https://book.kongfz.com/${shopId}/${itemId}/`)
	const { data: html } = await axios.get(`https://book.kongfz.com/${shopId}/${itemId}/`)
	res.setHeader('Content-Type', 'text/html')
	res.send(html)
})

app.listen(3000, () => {
    console.log("启动成功！")
})
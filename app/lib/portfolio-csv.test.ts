import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decodeCsvBytes, parsePortfolioCsv } from './portfolio-csv.ts'

describe('decodeCsvBytes', () => {
	it('returns UTF-8 decoded string when no replacement chars', () => {
		const utf8 = new TextEncoder().encode('Papier;Wartość;Waluta')
		const result = decodeCsvBytes(utf8.buffer)
		assert.equal(result, 'Papier;Wartość;Waluta')
	})

	it('falls back to windows-1250 when UTF-8 has replacement chars', () => {
		// "ść" in Windows-1250 = 0x9C 0xE6; invalid as UTF-8 so triggers fallback
		const win1250 = new Uint8Array([0x57, 0x61, 0x72, 0x74, 0x6f, 0x9c, 0xe6]) // Wartość
		const result = decodeCsvBytes(win1250.buffer)
		assert.equal(result, 'Wartość')
	})
})

describe('parsePortfolioCsv', () => {
	it('returns empty array for empty or single-line input', () => {
		assert.deepEqual(parsePortfolioCsv(''), [])
		assert.deepEqual(parsePortfolioCsv('Papier;Wartość'), [])
	})

	it('parses eMAKLER format with Polish headers and semicolon delimiter', () => {
		const csv = `Papier;Giełda;Liczba dostępna (Blokady);Kurs;Waluta;Wartość;Waluta
IBTA LN ETF;GBR-LSE;186;5.9320;USD;4087.48;PLN
IQQH GR ETF;DEU-XETRA;81;9.3090;EUR;3217.14;PLN`
		const result = parsePortfolioCsv(csv)
		assert.equal(result.length, 2)
		assert.equal(result[0].name, 'IBTA LN ETF')
		assert.equal(result[0].value, 4087.48)
		assert.equal(result[0].currency, 'PLN')
		assert.equal(result[1].name, 'IQQH GR ETF')
		assert.equal(result[1].value, 3217.14)
		assert.equal(result[1].currency, 'PLN')
	})

	it('skips meta lines before header row', () => {
		const csv = `mBank S.A. Bankowość Detaliczna
Skrytka Pocztowa 2108
eMAKLER - Portfel

Papier;Giełda;Wartość;Waluta
VTI;GBR-LSE;1200.50;PLN`
		const result = parsePortfolioCsv(csv)
		assert.equal(result.length, 1)
		assert.equal(result[0].name, 'VTI')
		assert.equal(result[0].value, 1200.5)
		assert.equal(result[0].currency, 'PLN')
	})

	it('parses English headers with comma delimiter', () => {
		const csv = 'ticker,value,currency\nVTI,1500.25,USD'
		const result = parsePortfolioCsv(csv)
		assert.equal(result.length, 1)
		assert.equal(result[0].name, 'VTI')
		assert.equal(result[0].value, 1500.25)
		assert.equal(result[0].currency, 'USD')
	})

	it('assigns UUID and defaults currency to PLN when missing', () => {
		const csv = 'Papier;Wartość\nIBTA;1000'
		const result = parsePortfolioCsv(csv)
		assert.equal(result.length, 1)
		assert.match(result[0].id, /^[0-9a-f-]{36}$/)
		assert.equal(result[0].currency, 'PLN')
	})

	it('skips rows with invalid or missing value', () => {
		const csv = `Papier;Wartość;Waluta
VTI;1000;PLN
BND;invalid;USD
BND;;EUR`
		const result = parsePortfolioCsv(csv)
		assert.equal(result.length, 1)
		assert.equal(result[0].name, 'VTI')
	})

	it('parses eMAKLER format with encoding-corrupted headers (replacement chars)', () => {
		// Simulates file saved as UTF-8 with Windows-1250 bytes replaced by U+FFFD
		const csv = `mBank S.A. Bankowo�� Detaliczna
Papier;Gie�da;Liczba dost�pna;Kurs;Waluta;Warto��;Waluta
IBTA LN ETF;GBR-LSE;186;5.9320;USD;4087.48;PLN
IQQH GR ETF;DEU-XETRA;81;9.3090;EUR;3217.14;PLN`
		const result = parsePortfolioCsv(csv)
		assert.equal(result.length, 2)
		assert.equal(result[0].name, 'IBTA LN ETF')
		assert.equal(result[0].value, 4087.48)
		assert.equal(result[0].currency, 'PLN')
		assert.equal(result[1].name, 'IQQH GR ETF')
		assert.equal(result[1].value, 3217.14)
	})
})

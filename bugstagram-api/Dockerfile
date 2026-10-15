# Estágio 1: Build
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copia dependências primeiro para aproveitar o cache do Docker
COPY go.mod go.sum ./
RUN go mod download

# Copia todo o código-fonte da API
COPY . .

# Compila o binário estático
RUN CGO_ENABLED=0 GOOS=linux go build -o server .

# Estágio 2: Imagem final enxuta
FROM alpine:latest

# Instala certificados TLS padrão
RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copia o executável gerado no estágio anterior
COPY --from=builder /app/server .

# Altere a porta caso sua API escute em outra diferente (ex: 8080)
EXPOSE 8080

# Executa o binário compilado
CMD ["./server"]
<?php
/**
 * 🏥 HospAudit - Configurações de Conexão com o Banco de Dados MySQL (Suporte a .env e XAMPP/WAMP)
 * 
 * Este arquivo carrega as configurações do arquivo .env se ele existir,
 * ou utiliza os padrões adequados para o seu ambiente local do XAMPP / WAMP.
 */

// 1. Carregamento simplificado e robusto de variáveis de ambiente do arquivo .env
$envFile = __DIR__ . '/.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines !== false) {
        foreach ($lines as $line) {
            $line = trim($line);
            // Ignorar comentários ou linhas vazias
            if (empty($line) || $line[0] === '#' || strpos($line, '//') === 0) {
                continue;
            }
            
            // Separar pelo primeiro '='
            $parts = explode('=', $line, 2);
            if (count($parts) === 2) {
                $key = trim($parts[0]);
                $val = trim($parts[1]);
                
                // Remover aspas simples ou duplas no início e fim do valor se existirem
                if (strlen($val) >= 2) {
                    if (($val[0] === '"' && substr($val, -1) === '"') || 
                        ($val[0] === "'" && substr($val, -1) === "'")) {
                        $val = substr($val, 1, -1);
                    }
                }
                
                // Definir na superglobal $_ENV e $_SERVER e no ambiente do PHP (putenv)
                $_ENV[$key] = $val;
                $_SERVER[$key] = $val;
                putenv("{$key}={$val}");
            }
        }
    }
}

// 2. Função auxiliar para obter as variáveis com fallback seguro
if (!function_exists('get_env_var')) {
    function get_env_var($key, $default = '') {
        $val = getenv($key);
        if ($val !== false) return $val;
        if (isset($_ENV[$key])) return $_ENV[$key];
        if (isset($_SERVER[$key])) return $_SERVER[$key];
        return $default;
    }
}

// 3. Definição das Constantes do Banco de Dados a partir do .env ou com fallback padrão do XAMPP
define('DB_HOST', get_env_var('DB_HOST', 'localhost'));
define('DB_PORT', get_env_var('DB_PORT', '3306'));
define('DB_USER', get_env_var('DB_USER', 'root'));
define('DB_PASSWORD', get_env_var('DB_PASSWORD', ''));
define('DB_NAME', get_env_var('DB_NAME', 'hospaudit'));

// 4. Configurações de exibição de erros (Ative para depuração local, desative em produção)
define('DISPLAY_ERRORS', true);

if (DISPLAY_ERRORS) {
    ini_set('display_errors', 1);
    ini_set('display_startup_errors', 1);
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', 0);
    error_reporting(0);
}

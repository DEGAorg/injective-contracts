class ConfigNetwork {
    chain_id?: string;
    rpc_endpoint?: string;
}

class ConfigContract {
    address?: string;
    code_id?: number;
}

class ConfigEnv {
    network?: string;
    contracts?: {
        [name: string]: ConfigContract;
    };
}

class ConfigVariables {
    active_env?: string;
    networks?: {
        [name: string]: ConfigNetwork;
    };
    envs?: {
        [name: string]: ConfigEnv;
    };
}